import { useCallback, useState } from 'react';
import { Sparkles, Undo2, Trash2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme, resolveTheme } from '../../contexts/ThemeContext';
import { usePremium } from '../../lib/premium';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import LineLoader from '../ui/LineLoader';
import SpecPreview from './SpecPreview';
import { PRESET_SPECS } from '../../design/skins';
import type { ThemeSpec } from '../../design/themeSpec';
import { applyPatch, shade, type ContrastReport } from '../../design/themeCheck';
import {
  generateTheme, createUserTheme, updateUserTheme, deleteUserTheme,
  ThemeLimitError, FREE_THEME_LIMIT, TWEAK_LIMIT,
} from '../../lib/userThemes';

// ═══════════════════════════════════════════════════════════════════
// 言葉からテーマを作る画面。
//
// 「作って終わり」にしない。**アプリ全体をその見た目に変えたまま**手直しさせる
// （下書きは ThemeContext の draftSpec に置く。保存するまでサーバーには書かない）。
//
//   ・よく使う手直しは**ボタン**で置く＝APIを呼ばない。無料で即時
//   ・プロンプトは逃げ道。1テーマにつき手直しは TWEAK_LIMIT 回まで
//   ・手直しのたびに版を積む → **「元に戻す」が副産物として手に入る**
//   ・当てた直後に必ず検算（themeCheck の applyPatch がやる）
//
// 版権: 入力した言葉は保存も表示もしない。作品名を入れても、残るのは数字と選択肢だけ。
// ═══════════════════════════════════════════════════════════════════

const TWEAK_KEY = (id: string) => `fan_theme_tweaks_${id}`;

const EXAMPLES = ['夜の海みたいに静かな青', 'レトロな喫茶店', '真っ白で紙のよう', '派手でうるさいくらい元気'];

function newDraft(): ThemeSpec {
  // デフォルトの色を土台にする。角丸だけは必ず数字を持たせる
  // （null は「アプリ既定の角丸をそのまま使う」＝デフォルトテーマ専用の意味）
  return { ...PRESET_SPECS.classic, name: '新しいテーマ', radius: 12 };
}

export default function ThemeStudio() {
  const {
    settings, userThemes, userThemeId, selectUserTheme, reloadUserThemes,
    draftSpec, setDraftSpec,
  } = useTheme();
  const premium = usePremium();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const navigate = useNavigate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<ThemeSpec[]>([]);
  const [tweaks, setTweaks] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<ContrastReport[]>([]);

  const dark = resolveTheme(settings.theme) === 'dark';
  const draft = draftSpec;
  const fixedCount = report.filter(r => r.fixed).length;

  const start = useCallback((base: ThemeSpec, id: string | null) => {
    setEditingId(id);
    setHistory([]);
    setNote('');
    setError('');
    setReport([]);
    setPrompt('');
    setTweaks(id ? Number(localStorage.getItem(TWEAK_KEY(id)) ?? 0) : 0);
    setDraftSpec(base);
  }, [setDraftSpec]);

  const close = useCallback(() => {
    setDraftSpec(null);
    setEditingId(null);
    setHistory([]);
    setPrompt('');
    setNote('');
    setError('');
    setReport([]);
  }, [setDraftSpec]);

  /** 差分を当てて版を積む。ボタンでもプロンプトでも入口はここ1つ */
  const push = useCallback((patch: Record<string, unknown>, why = '') => {
    if (!draft) return;
    const { spec, report: rep } = applyPatch(draft, patch);
    setHistory(h => [...h, draft]);
    setDraftSpec(spec);
    setReport(rep);
    setNote(why);
  }, [draft, setDraftSpec]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      setDraftSpec(h[h.length - 1]);
      setNote('');
      return h.slice(0, -1);
    });
  }, [setDraftSpec]);

  const ask = useCallback(async () => {
    const wish = prompt.trim();
    if (!draft || !wish || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await generateTheme(wish, draft);
      setHistory(h => [...h, draft]);
      setDraftSpec(res.spec);
      setReport(res.report);
      setNote(res.note);
      setPrompt('');
      // 最初の1回（作る）は手直しに数えない
      if (history.length > 0 || editingId) setTweaks(t => t + 1);
    } catch (e) {
      setError(e instanceof ThemeLimitError
        ? '今日はこれ以上作れません。明日また試せます'
        : 'うまく作れませんでした。言葉を変えてもう一度お試しください');
    } finally {
      setBusy(false);
    }
  }, [prompt, draft, busy, history.length, editingId, setDraftSpec]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (editingId) {
      const ok = await updateUserTheme(editingId, draft);
      if (!ok) { toast('保存できませんでした', 'error'); return; }
      localStorage.setItem(TWEAK_KEY(editingId), String(tweaks));
      await reloadUserThemes();
      selectUserTheme(editingId);
      close();
      toast('保存しました');
      return;
    }
    if (!premium && userThemes.length >= FREE_THEME_LIMIT) {
      toast('無料で保存できるテーマは1つです', 'error');
      return;
    }
    const created = await createUserTheme(draft);
    if (!created) { toast('保存できませんでした', 'error'); return; }
    localStorage.setItem(TWEAK_KEY(created.id), String(tweaks));
    await reloadUserThemes();
    selectUserTheme(created.id);
    close();
    toast('保存しました');
  }, [draft, editingId, premium, userThemes.length, tweaks, toast, reloadUserThemes, selectUserTheme, close]);

  const remove = useCallback(async (id: string) => {
    const ok = await confirmDialog({
      title: 'このテーマを削除しますか？',
      message: '元に戻せません。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (!ok) return;
    if (!await deleteUserTheme(id)) { toast('削除できませんでした', 'error'); return; }
    localStorage.removeItem(TWEAK_KEY(id));
    await reloadUserThemes();
    toast('削除しました');
  }, [confirmDialog, reloadUserThemes, toast]);

  // ── ボタンでの手直し（APIを呼ばない＝無料・即時） ──────────────
  const tweakButtons: { label: string; run: () => void }[] = draft ? [
    {
      label: '明るく',
      run: () => push({
        dark: { ...draft.dark, bg: shade(draft.dark.bg, 12), surface: shade(draft.dark.surface, 12), surface2: shade(draft.dark.surface2, 12) },
        light: { ...draft.light, bg: shade(draft.light.bg, 10), surface: shade(draft.light.surface, 10), surface2: shade(draft.light.surface2, 10) },
      }, '地を明るくしました'),
    },
    {
      label: '暗く',
      run: () => push({
        dark: { ...draft.dark, bg: shade(draft.dark.bg, -12), surface: shade(draft.dark.surface, -12), surface2: shade(draft.dark.surface2, -12) },
        light: { ...draft.light, bg: shade(draft.light.bg, -10), surface: shade(draft.light.surface, -10), surface2: shade(draft.light.surface2, -10) },
      }, '地を暗くしました'),
    },
    {
      label: '角を丸く',
      run: () => push({ radius: Math.min(24, (draft.radius ?? 12) + 4), shape: 'round' }, '角を丸くしました'),
    },
    {
      label: '角ばらせる',
      run: () => push({ radius: Math.max(0, (draft.radius ?? 12) - 4), shape: draft.shape === 'round' ? 'square' : draft.shape }, '角を落としました'),
    },
    {
      label: draft.texture === 'none' ? '質感をつける' : '質感を消す',
      run: () => push({ texture: draft.texture === 'none' ? 'dots' : 'none' }, '地の質感を変えました'),
    },
    {
      label: draft.bars === 'band' ? '上の帯をやめる' : '上を帯にする',
      run: () => push({ bars: draft.bars === 'band' ? 'plate' : 'band' }, '上部バーの扱いを変えました'),
    },
  ] : [];

  // ── 一覧（作っていないときの表示） ────────────────────────────
  if (!draft) {
    return (
      <section>
        <p className="text-label-tertiary text-xs mb-3">自分のテーマ</p>
        <div className="grid grid-cols-3 gap-2">
          {userThemes.map(t => {
            const on = userThemeId === t.id;
            return (
              <div key={t.id} className="relative">
                <button
                  onClick={() => selectUserTheme(t.id)}
                  onDoubleClick={() => start(t.spec, t.id)}
                  aria-pressed={on}
                  className={`w-full rounded-xl overflow-hidden border-2 transition-colors ${on ? '' : 'border-subtle'}`}
                  style={on ? { borderColor: 'var(--accent-color)' } : undefined}
                >
                  <SpecPreview spec={t.spec} dark={dark} />
                  <div className="bg-bg-secondary py-1.5">
                    <p className="text-xs text-label-primary text-center truncate px-1">{t.spec.name}</p>
                  </div>
                </button>
                <div className="flex justify-center gap-3 pt-1">
                  <button onClick={() => start(t.spec, t.id)} className="text-[11px] text-label-secondary pressable">手直し</button>
                  <button onClick={() => remove(t.id)} className="text-[11px] text-label-tertiary pressable" aria-label="削除">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => start(newDraft(), null)}
            className="rounded-xl border-2 border-dashed border-subtle flex flex-col items-center justify-center gap-1 py-4"
          >
            <Plus size={18} className="text-label-secondary" />
            <span className="text-[11px] text-label-secondary text-center leading-tight px-1">AIで作る</span>
          </button>
        </div>
        <p className="text-label-tertiary text-xs mt-2 px-1 leading-relaxed">
          好きな雰囲気を言葉で伝えると、色・形・書体をまとめて作ります。
          {!premium && `無料で保存できるのは${FREE_THEME_LIMIT}つまでです。`}
        </p>
      </section>
    );
  }

  // ── 作成・手直し中 ──────────────────────────────────────────────
  const tweaksLeft = TWEAK_LIMIT - tweaks;
  return (
    <section className="rounded-xl border border-subtle p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: 'var(--accent-color)' }} />
        <p className="text-label-primary text-sm flex-1">{draft.name}</p>
        <button
          onClick={undo}
          disabled={history.length === 0}
          className="flex items-center gap-1 text-[12px] text-label-secondary disabled:opacity-30 pressable"
        >
          <Undo2 size={13} />元に戻す
        </button>
      </div>

      <p className="text-label-tertiary text-xs leading-relaxed">
        いま画面全体がこのテーマになっています。気に入ったら保存してください。
      </p>

      {/* ボタンでの手直し。押しても料金はかからない */}
      <div className="flex flex-wrap gap-1.5">
        {tweakButtons.map(b => (
          <button
            key={b.label}
            onClick={b.run}
            data-skin-part="chip"
            className="px-3 py-1.5 rounded-full text-[12px] text-label-primary bg-fill-tertiary pressable"
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* 言葉での手直し。こちらは回数を数える */}
      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask(); }}
          placeholder={history.length === 0 ? EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)] : 'もっと落ち着いた色に'}
          maxLength={200}
          disabled={busy || tweaksLeft <= 0}
          className="flex-1 px-3 py-2 rounded-lg bg-bg-tertiary text-[13px] text-input-text placeholder:text-input-placeholder outline-none disabled:opacity-50"
        />
        <button
          onClick={ask}
          disabled={busy || !prompt.trim() || tweaksLeft <= 0}
          className="px-4 rounded-lg text-[13px] font-medium disabled:opacity-40 pressable"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
        >
          {history.length === 0 ? '作る' : '直す'}
        </button>
      </div>

      {busy && <LineLoader label="AIが色と形を選んでいます…" />}
      {!busy && note && <p className="text-label-secondary text-xs">{note}</p>}
      {!busy && fixedCount > 0 && (
        <p className="text-label-tertiary text-xs leading-relaxed">
          読みにくい組み合わせが{fixedCount}か所あったので、文字の色を自動で寄せました。
        </p>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
      {tweaksLeft <= 0 && (
        <p className="text-label-tertiary text-xs leading-relaxed">
          言葉での手直しは{TWEAK_LIMIT}回までです。ボタンでの調整は続けられます。
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={close} className="flex-1 py-2.5 rounded-lg bg-fill-tertiary text-[13px] text-label-primary pressable">
          やめる
        </button>
        <button
          onClick={save}
          disabled={history.length === 0 && !editingId}
          className="flex-1 py-2.5 rounded-lg text-[13px] font-medium disabled:opacity-40 pressable"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
        >
          保存する
        </button>
      </div>

      {!premium && !editingId && userThemes.length >= FREE_THEME_LIMIT && (
        <button onClick={() => navigate('/premium')} className="text-xs text-left leading-relaxed pressable" style={{ color: 'var(--accent-color)' }}>
          保存できるテーマは無料で{FREE_THEME_LIMIT}つまで。プレミアムならいくつでも保存して切り替えられます。
        </button>
      )}
    </section>
  );
}
