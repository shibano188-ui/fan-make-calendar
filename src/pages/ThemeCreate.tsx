import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ImagePlus, Undo2, X } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import LineLoader from '../components/ui/LineLoader';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useTheme, type ThemeDraft } from '../contexts/ThemeContext';
import { usePremium } from '../lib/premium';
import { PRESET_SPECS } from '../design/skins';
import { applyPatch, shade, type ContrastReport } from '../design/themeCheck';
import { hasNativePhotoPicker, pickPhoto } from '../lib/pickPhoto';
import { shrinkImage } from '../lib/shrinkImage';
import {
  generateTheme, createUserTheme, updateUserTheme,
  ThemeLimitError, FREE_THEME_LIMIT, TWEAK_LIMIT,
} from '../lib/userThemes';

// ═══════════════════════════════════════════════════════════════════
// テーマを作る画面。
//
// **プリセットを改造して作るのではない。** 言葉（と、あれば参考画像）を渡すと
// 色・形・書体・質感が丸ごと決まる。7本の軸は AI が埋めるためのもので、
// 使う人に選ばせるものではないので、作る前には一切出さない。
//
// 出来たら**アプリ全体がその見た目に変わる**。他の画面へ見に行っているあいだは
// DraftBar（細い帯）が出て、1タップでここへ戻れる。
// 下書きは画面でなく ThemeContext が持っているので、移動しても消えない。
//
// 版権: 入力した言葉も参考画像も保存しない。残るのは数字と選択肢だけ。
// ═══════════════════════════════════════════════════════════════════

const MAX_REFS = 3;

const PLACEHOLDER = `例）夜の海みたいに静かな青。角は丸めで、文字はやわらかい書体。
派手にしないで、写真が主役に見えるように。`;

function blankDraft(): ThemeDraft {
  // 角丸だけは必ず数字を入れる（null は「アプリ既定の角丸のまま」＝デフォルト専用の意味）
  return {
    spec: { ...PRESET_SPECS.classic, name: '新しいテーマ', radius: 12 },
    history: [],
    editingId: null,
    tweaks: 0,
    note: '',
  };
}

export default function ThemeCreate() {
  const { userThemes, selectUserTheme, reloadUserThemes, draft, setDraft } = useTheme();
  const premium = usePremium();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const [prompt, setPrompt] = useState('');
  const [refs, setRefs] = useState<{ preview: string; base64: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ContrastReport[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 入った時点で下書きを用意する。手直しなら既にあるテーマから始める。
  // 他のタブを見に行って戻ってきたときは、続きから（下書きを作り直さない）
  useEffect(() => {
    if (draft) return;
    if (editId) {
      const t = userThemes.find(x => x.id === editId);
      if (t) {
        setDraft({
          spec: t.spec,
          history: [],
          editingId: t.id,
          tweaks: Number(localStorage.getItem(`fan_theme_tweaks_${t.id}`) ?? 0),
          note: '',
        });
        return;
      }
      // 一覧がまだ来ていないだけかもしれないので、来るまで待つ
      if (userThemes.length === 0) return;
    }
    setDraft(blankDraft());
  }, [draft, editId, userThemes, setDraft]);

  const spec = draft?.spec ?? null;
  const made = (draft?.history.length ?? 0) > 0 || !!draft?.editingId;
  const tweaksLeft = TWEAK_LIMIT - (draft?.tweaks ?? 0);
  const fixedCount = report.filter(r => r.fixed).length;

  /** 差分を当てて版を積む。ボタンでも言葉でも入口はここ1つ */
  const push = useCallback((patch: Record<string, unknown>, why: string) => {
    if (!draft) return;
    const { spec: next, report: rep } = applyPatch(draft.spec, patch);
    setDraft({ ...draft, spec: next, history: [...draft.history, draft.spec], note: why });
    setReport(rep);
  }, [draft, setDraft]);

  const undo = useCallback(() => {
    if (!draft || draft.history.length === 0) return;
    setDraft({
      ...draft,
      spec: draft.history[draft.history.length - 1],
      history: draft.history.slice(0, -1),
      note: '',
    });
  }, [draft, setDraft]);

  // ── 参考画像（任意） ─────────────────────────────────────────
  const addImage = useCallback(async (dataUrl: string) => {
    const shrunk = await shrinkImage(dataUrl);
    if (!shrunk) { toast('この画像は読み込めませんでした', 'error'); return; }
    setRefs(prev => prev.length >= MAX_REFS ? prev : [...prev, { preview: dataUrl, base64: shrunk.base64 }]);
  }, [toast]);

  const openPicker = useCallback(async () => {
    if (!hasNativePhotoPicker()) { fileRef.current?.click(); return; }
    const res = await pickPhoto();
    if (res.status === 'denied') {
      await confirmDialog({
        title: '写真へのアクセスが必要です',
        message: '設定アプリ ＞ FanHive ＞ 写真 で許可すると、参考画像を選べます。',
        hideCancel: true,
      });
      return;
    }
    if (res.status === 'picked') await addImage(res.dataUrl);
  }, [addImage, confirmDialog]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => addImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [addImage]);

  // ── 作る／直す ───────────────────────────────────────────────
  const ask = useCallback(async () => {
    const wish = prompt.trim();
    if (!draft || busy) return;
    if (!wish && refs.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await generateTheme(wish, draft.spec, refs.map(r => r.base64));
      setDraft({
        ...draft,
        spec: res.spec,
        history: [...draft.history, draft.spec],
        note: res.note,
        // 最初の1回（作る）は手直しに数えない
        tweaks: made ? draft.tweaks + 1 : draft.tweaks,
      });
      setReport(res.report);
      setPrompt('');
      setRefs([]);
    } catch (e) {
      setError(e instanceof ThemeLimitError
        ? '今日はこれ以上作れません。明日また試せます'
        : 'うまく作れませんでした。書き方を変えてもう一度お試しください');
    } finally {
      setBusy(false);
    }
  }, [prompt, refs, draft, busy, made, setDraft]);

  // ── 保存・やめる ─────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!draft) return;
    const { spec: s, editingId, tweaks } = draft;
    if (editingId) {
      if (!await updateUserTheme(editingId, s)) { toast('保存できませんでした', 'error'); return; }
      localStorage.setItem(`fan_theme_tweaks_${editingId}`, String(tweaks));
      await reloadUserThemes();
      selectUserTheme(editingId);
      setDraft(null);
      navigate('/customize');
      toast('保存しました');
      return;
    }
    if (!premium && userThemes.length >= FREE_THEME_LIMIT) {
      toast(`無料で保存できるテーマは${FREE_THEME_LIMIT}つです`, 'error');
      return;
    }
    const created = await createUserTheme(s);
    if (!created) { toast('保存できませんでした', 'error'); return; }
    localStorage.setItem(`fan_theme_tweaks_${created.id}`, String(tweaks));
    await reloadUserThemes();
    selectUserTheme(created.id);
    setDraft(null);
    navigate('/customize');
    toast('保存しました');
  }, [draft, premium, userThemes.length, toast, reloadUserThemes, selectUserTheme, setDraft, navigate]);

  const quit = useCallback(async () => {
    if (made) {
      const ok = await confirmDialog({
        title: '保存せずにやめますか？',
        message: '作ったテーマは残りません。',
        confirmLabel: 'やめる',
        destructive: true,
      });
      if (!ok) return;
    }
    setDraft(null);
    navigate('/customize');
  }, [made, confirmDialog, setDraft, navigate]);

  if (!spec || !draft) return null;

  // ボタンでの手直し。**AIを呼ばない＝無料・即時・手直しの回数も減らない**
  const quickTweaks: { label: string; run: () => void }[] = [
    { label: '明るく', run: () => push({
      dark:  { ...spec.dark,  bg: shade(spec.dark.bg, 12),  surface: shade(spec.dark.surface, 12),  surface2: shade(spec.dark.surface2, 12) },
      light: { ...spec.light, bg: shade(spec.light.bg, 10), surface: shade(spec.light.surface, 10), surface2: shade(spec.light.surface2, 10) },
    }, '明るくしました') },
    { label: '暗く', run: () => push({
      dark:  { ...spec.dark,  bg: shade(spec.dark.bg, -12),  surface: shade(spec.dark.surface, -12),  surface2: shade(spec.dark.surface2, -12) },
      light: { ...spec.light, bg: shade(spec.light.bg, -10), surface: shade(spec.light.surface, -10), surface2: shade(spec.light.surface2, -10) },
    }, '暗くしました') },
    { label: '角を丸く', run: () => push({ radius: Math.min(24, (spec.radius ?? 12) + 4), shape: 'round' }, '角を丸くしました') },
    { label: '角ばらせる', run: () => push({ radius: Math.max(0, (spec.radius ?? 12) - 4), shape: spec.shape === 'round' ? 'square' : spec.shape }, '角を落としました') },
  ];

  return (
    <Layout hideBottomTab>
      <Header title={draft.editingId ? 'テーマを直す' : 'テーマを作る'} onBack={quit} />

      <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
        {/* 出来たものの説明。作る前は出さない */}
        {made && (
          <div className="flex items-center gap-2">
            <p className="text-label-primary text-[15px] flex-1 truncate">{spec.name}</p>
            <button
              onClick={undo}
              disabled={draft.history.length === 0}
              className="flex items-center gap-1 text-[12px] text-label-secondary disabled:opacity-30 pressable"
            >
              <Undo2 size={13} />元に戻す
            </button>
          </div>
        )}
        {made && (
          <p className="text-label-tertiary text-xs leading-relaxed">
            いまアプリ全体がこの見た目になっています。他の画面を見に行っても、下に出る帯から戻ってこられます。
            {draft.note && <><br />{draft.note}</>}
          </p>
        )}

        {/* 書き込む欄。ここが主役 */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={made ? '直したいところを書いてください（例：もっと落ち着いた色に）' : PLACEHOLDER}
          rows={made ? 3 : 6}
          maxLength={600}
          disabled={busy || (made && tweaksLeft <= 0)}
          className="w-full px-3.5 py-3 rounded-xl bg-bg-secondary border border-subtle text-[14px] leading-relaxed text-input-text placeholder:text-input-placeholder outline-none resize-none disabled:opacity-50"
        />

        {/* 参考画像は任意。無くても作れる */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {refs.map((r, i) => (
              <div key={i} className="relative">
                <img src={r.preview} alt="" className="w-14 h-14 object-cover rounded-lg border border-subtle" />
                <button
                  onClick={() => setRefs(prev => prev.filter((_, j) => j !== i))}
                  aria-label="外す"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' }}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {refs.length < MAX_REFS && (
              <button
                onClick={openPicker}
                className="w-14 h-14 rounded-lg border border-dashed border-subtle flex flex-col items-center justify-center gap-0.5 pressable"
              >
                <ImagePlus size={15} className="text-label-secondary" />
                <span className="text-[9px] text-label-tertiary">参考画像</span>
              </button>
            )}
            {!hasNativePhotoPicker() && (
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            )}
          </div>
          <p className="text-label-tertiary text-[11px] mt-1.5 leading-relaxed">
            参考画像は無くてもかまいません。付けると色や雰囲気の手がかりに使います。
            画像は見た目を読むためだけに使い、保存しません。
          </p>
        </div>

        {busy && <LineLoader label="AIが色と形を選んでいます…" />}
        {!busy && (
          <button
            onClick={ask}
            disabled={!prompt.trim() && refs.length === 0}
            className="w-full py-3 rounded-xl text-[15px] font-medium disabled:opacity-40 pressable"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            {made ? '直す' : '作る'}
          </button>
        )}
        {error && <p className="text-xs" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
        {made && tweaksLeft <= 0 && (
          <p className="text-label-tertiary text-xs leading-relaxed">
            言葉での手直しは{TWEAK_LIMIT}回までです。下の微調整は続けられます。
          </p>
        )}

        {/* 微調整。作ったあとにだけ、控えめに出す */}
        {made && !busy && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {quickTweaks.map(t => (
              <button key={t.label} onClick={t.run} className="text-[12px] text-label-secondary underline underline-offset-4 pressable">
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!busy && fixedCount > 0 && (
          <p className="text-label-tertiary text-xs leading-relaxed">
            読みにくい組み合わせが{fixedCount}か所あったので、文字の色を自動で寄せました。
          </p>
        )}

        {/* 他の画面で見てみる。テーマはアプリ全体に当たって初めて良し悪しが分かる */}
        {made && !busy && (
          <button onClick={() => navigate('/explore')} className="text-[12px] text-left pressable" style={{ color: 'var(--accent-color)' }}>
            他の画面で見てみる
          </button>
        )}

        {made && (
          <div className="flex gap-2 pt-2">
            <button onClick={quit} className="flex-1 py-3 rounded-xl bg-fill-tertiary text-[14px] text-label-primary pressable">
              やめる
            </button>
            <button
              onClick={save}
              className="flex-1 py-3 rounded-xl text-[14px] font-medium pressable"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
            >
              保存する
            </button>
          </div>
        )}

        {made && !premium && !draft.editingId && userThemes.length >= FREE_THEME_LIMIT && (
          <button onClick={() => navigate('/premium')} className="text-xs text-left leading-relaxed pressable" style={{ color: 'var(--accent-color)' }}>
            保存できるテーマは無料で{FREE_THEME_LIMIT}つまで。プレミアムならいくつでも保存して切り替えられます。
          </button>
        )}
      </div>
    </Layout>
  );
}
