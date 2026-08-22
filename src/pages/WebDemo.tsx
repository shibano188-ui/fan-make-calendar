// ═══════════════════════════════════════════════════════════════════
// web版のデモ（design/panel ブランチ限定・本番には出さない）
//
// アプリ版をそのまま横に伸ばすのではなく、評価の定まった web アプリの
// 作法に合わせて置き直している。参考にした定石:
//
//  - 主ナビは左のサイドバーに常時出す（項目が6つを超える製品はこれが定石）。
//    検索・通知・アカウントなどの共通機能は上部バーへ（Gmail / Linear / Spotify）
//  - 三列構成「全体 → 作業 → 詳細」。詳細は画面遷移ではなく右パネルで開き、
//    一覧を見失わせない（Gmail / Linear が定着させた形）
//  - 一覧はグリッド（Pinterest）。幅に応じて2〜5列
//  - 絞り込みはデスクトップでは**モーダルにしない**。常時表示が定石で、
//    開閉の手間なく条件を足し引きできる（EC のフィルタUXの基本形）
//  - ホバーで操作を出す（触る画面には無い層）／キーボードの近道を用意する
//
// レイアウトの原則（ここを外すと全部崩れる）:
//   ルートを h-[100dvh] + overflow-hidden で「画面ぴったり」に固定し、
//   中の列それぞれに overflow-y-auto を持たせる。ルートを min-h にすると
//   親の高さが中身で伸びてしまい、列ごとのスクロールが一切効かなくなる。
//
// 幅が足りないときの逃げ:
//   サイドバー   … md 未満は左からかぶせる（上部バーの≡から）
//   絞り込み     … lg 未満は左からかぶせる（上部バーのつまみから）
//   詳細         … xl 未満は右からかぶせる（押したのに無反応、を作らない）
//
// 3つの外皮（現行 / PANEL / SURGE）はそのまま効く。CSS変数と data-skin を
// アプリ版と共有しているため、この画面のためのテーマは書いていない。
// ═══════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Search, Heart, User, Plus, SlidersHorizontal, Bell, X, ExternalLink,
  LayoutGrid, Rows3, Star, Settings, SmilePlus, Menu, CalendarPlus, Check,
} from 'lucide-react';
import { listExploreEvents } from '../lib/api';
import { parseCategories, parseImageUrls, getPrimaryCategoryColor } from '../lib/constants';
import { deriveStatus, deriveItemType, statusLabel, itemDateLines, todayStr, type ItemStatus } from '../design/tokens';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import { SKINS, SKIN_IDS } from '../design/skins';
import { useTheme } from '../contexts/ThemeContext';
import OptImg from '../components/ui/OptImg';
import type { CalendarEvent } from '../types';

type Density = 'grid' | 'rows';
type View = 'home' | 'explore' | 'saved' | 'me';

const VIEWS: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'explore', label: '探す', icon: Search },
  { id: 'saved', label: 'いいね', icon: Heart },
  { id: 'me', label: 'マイページ', icon: User },
];

const STATUS_ORDER: ItemStatus[] = ['preorder', 'preorder_soon', 'onsale', 'sale_soon', 'preorder_ended', 'ended'];

function yen(n?: number): string {
  return typeof n === 'number' && n > 0 ? `¥${n.toLocaleString('ja-JP')}` : '';
}

/** 状態の色。CSS変数なので外皮に追従する */
function statusColor(s: ItemStatus): string {
  switch (s) {
    case 'preorder': return 'var(--status-preorder)';
    case 'preorder_soon': return 'var(--status-info)';
    case 'onsale': return 'var(--status-onsale)';
    case 'sale_soon': return 'var(--status-upcoming)';
    default: return 'var(--status-ended)';
  }
}

export default function WebDemo() {
  const { skin, setSkin } = useTheme();
  const navigate = useNavigate();

  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('explore');
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<Density>('grid');
  const [mode, setMode] = useState<'all' | 'goods' | 'event'>('all');
  const [statuses, setStatuses] = useState<Set<ItemStatus>>(new Set());
  const [works, setWorks] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // 幅が足りないときにかぶせて出すもの
  const [navOpen, setNavOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // この画面の中だけで動く状態（サーバーには書かない。デモなので端末にも残さない）
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<Record<string, ReactionType>>({});
  const [rxFor, setRxFor] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // 一覧は「探す」と同じ取得口を使う。デモ用のダミーではなく本物のデータ
  useEffect(() => {
    const today = todayStr();
    const to = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
    listExploreEvents(today, to)
      .then((r) => setItems(r))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'));
  }, []);

  // キーボードの近道: / で検索へ、Esc は開いているものを上から順に閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') {
        if (rxFor) setRxFor(null);
        else if (notesOpen) setNotesOpen(false);
        else if (filterOpen) setFilterOpen(false);
        else if (navOpen) setNavOpen(false);
        else if (openId) setOpenId(null);
        else (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, rxFor, notesOpen, filterOpen, navOpen]);

  const toggleSet = useCallback(<T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    fn(next);
  }, []);

  const toggleLike = useCallback((id: string, title: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); say('いいねを外しました'); }
      else { next.add(id); say(`いいねしました ─ ${title}`); }
      return next;
    });
  }, [say]);

  const pickReaction = useCallback((id: string, type: ReactionType) => {
    setReactions((prev) => {
      const next = { ...prev };
      if (next[id] === type) { delete next[id]; say('リアクションを外しました'); }
      else { next[id] = type; say(`${REACTIONS.find((r) => r.type === type)?.label}`); }
      return next;
    });
    setRxFor(null);
  }, [say]);

  // 件数つきの候補。絞り込みは常時表示なので、件数が見えることが効く
  const facets = useMemo(() => {
    const base = items ?? [];
    const st = new Map<ItemStatus, number>();
    const wk = new Map<string, number>();
    const ct = new Map<string, number>();
    const pf = new Map<string, number>();
    for (const e of base) {
      const s = deriveStatus(e);
      st.set(s, (st.get(s) ?? 0) + 1);
      if (e.workName) wk.set(e.workName, (wk.get(e.workName) ?? 0) + 1);
      for (const c of parseCategories(e.category)) ct.set(c, (ct.get(c) ?? 0) + 1);
      if (e.prefecture) pf.set(e.prefecture, (pf.get(e.prefecture) ?? 0) + 1);
    }
    return {
      statuses: STATUS_ORDER.filter((s) => st.has(s)).map((s) => [s, st.get(s) ?? 0] as [ItemStatus, number]),
      works: [...wk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14),
      cats: [...ct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
      prefs: [...pf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (items ?? []).filter((e) => {
      if (mode !== 'all' && deriveItemType(e) !== mode) return false;
      if (statuses.size && !statuses.has(deriveStatus(e))) return false;
      if (works.size && !(e.workName && works.has(e.workName))) return false;
      if (cats.size && !parseCategories(e.category).some((c) => cats.has(c))) return false;
      if (prefs.size && !(e.prefecture && prefs.has(e.prefecture))) return false;
      if (q && !`${e.title} ${e.workName ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (view === 'saved') list = list.filter((e) => liked.has(e.id));
    if (view === 'home') {
      // 受付中・もうすぐを先に。ホームは「今動くべきもの」から見せる
      const rank = (e: CalendarEvent) => STATUS_ORDER.indexOf(deriveStatus(e));
      list = [...list].sort((a, b) => rank(a) - rank(b));
    }
    return list;
  }, [items, query, mode, statuses, works, cats, prefs, view, liked]);

  const activeCount = statuses.size + works.size + cats.size + prefs.size + (mode !== 'all' ? 1 : 0);
  const clearAll = () => {
    setStatuses(new Set()); setWorks(new Set()); setCats(new Set()); setPrefs(new Set()); setMode('all');
  };
  const open = shown.find((e) => e.id === openId) ?? null;
  // 絞り込みで消えた項目を開いたままにしない
  useEffect(() => { if (openId && !open) setOpenId(null); }, [openId, open]);

  const viewTitle = view === 'home' ? 'ホーム' : view === 'saved' ? 'いいね' : view === 'me' ? 'マイページ' : '探す';

  const filterRail = (
    <FilterRail
      facets={facets} mode={mode} setMode={setMode}
      statuses={statuses} cats={cats} prefs={prefs}
      onToggleStatus={(s) => toggleSet(statuses, s, setStatuses)}
      onToggleCat={(c) => toggleSet(cats, c, setCats)}
      onTogglePref={(p) => toggleSet(prefs, p, setPrefs)}
      activeCount={activeCount} onClear={clearAll}
    />
  );

  const sidebar = (
    <SidebarBody
      view={view} setView={(v) => { setView(v); setNavOpen(false); }}
      works={facets.works} selectedWorks={works}
      onToggleWork={(w) => toggleSet(works, w, setWorks)}
      onPost={() => navigate('/post')}
      onNotes={() => { setNotesOpen(true); setNavOpen(false); }}
      likedCount={liked.size}
    />
  );

  return (
    // ルートは画面ぴったりに固定する。min-h にすると中の列がスクロールしなくなる
    <div className="web-demo h-[100dvh] flex overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--label-primary)' }}>

      {/* ── 左サイドバー（md 以上は常時。未満は上部バーの≡でかぶせる）── */}
      <aside className="wd-side hidden md:flex flex-col flex-shrink-0 w-[232px] border-r min-h-0"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
        {sidebar}
      </aside>
      {navOpen && (
        <Overlay onClose={() => setNavOpen(false)} side="left" width={264} label="メニュー">
          {sidebar}
        </Overlay>
      )}

      {/* ── 中央 ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* 上部バー：検索・通知・アカウント等の共通機能はここ */}
        <header className="wd-top flex items-center gap-2 px-3 md:px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
          <button onClick={() => setNavOpen(true)} aria-label="メニュー"
            className="wd-icon md:hidden p-2 rounded-[9px] pressable" style={{ color: 'var(--label-secondary)' }}>
            <Menu size={18} />
          </button>
          <div className="wd-search flex items-center gap-2 flex-1 min-w-0 max-w-[620px] px-3 py-2 rounded-[10px]"
            style={{ backgroundColor: 'var(--fill-quaternary)', border: '1px solid var(--border-subtle)' }}>
            <Search size={16} style={{ color: 'var(--label-tertiary)' }} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="グッズ・イベントを検索"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]"
              style={{ color: 'var(--input-text)' }} />
            {query
              ? <button onClick={() => setQuery('')} aria-label="クリア" className="pressable flex-shrink-0"><X size={15} style={{ color: 'var(--label-tertiary)' }} /></button>
              : <kbd className="wd-kbd hidden sm:block text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>/</kbd>}
          </div>
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {/* lg 未満は絞り込みが隠れるので、開く口をここに出す */}
            <button onClick={() => setFilterOpen(true)} aria-label="絞り込み"
              className="wd-icon lg:hidden relative p-2 rounded-[9px] pressable"
              style={activeCount > 0 ? { color: 'var(--accent-text)' } : { color: 'var(--label-tertiary)' }}>
              <SlidersHorizontal size={17} />
              {activeCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-[7px] h-[7px] rounded-full"
                  style={{ backgroundColor: 'var(--accent-color)' }} />
              )}
            </button>
            {([['grid', LayoutGrid], ['rows', Rows3]] as const).map(([d, Icon]) => (
              <button key={d} onClick={() => setDensity(d)} aria-label={d === 'grid' ? 'グリッド表示' : 'リスト表示'}
                className="wd-icon hidden sm:block p-2 rounded-[9px] pressable"
                style={density === d ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' } : { color: 'var(--label-tertiary)' }}>
                <Icon size={17} />
              </button>
            ))}
            <button onClick={() => navigate('/notices')} aria-label="お知らせ"
              className="wd-icon p-2 rounded-[9px] pressable" style={{ color: 'var(--label-tertiary)' }}>
              <Bell size={17} />
            </button>
            <select value={skin} onChange={(e) => setSkin(e.target.value as typeof skin)}
              aria-label="見た目"
              className="wd-select text-[12px] px-2 py-2 rounded-[9px] outline-none w-[104px] sm:w-[132px] flex-shrink-0 truncate"
              style={{ backgroundColor: 'var(--fill-quaternary)', color: 'var(--label-secondary)', border: '1px solid var(--border-subtle)' }}>
              {SKIN_IDS.map((id) => <option key={id} value={id}>{SKINS[id].name}</option>)}
            </select>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* 絞り込み：lg 以上は常時表示。未満はかぶせる */}
          <aside className="wd-filters hidden lg:block flex-shrink-0 w-[212px] border-r overflow-y-auto px-4 py-4"
            style={{ borderColor: 'var(--border-subtle)' }}>
            {filterRail}
          </aside>
          {filterOpen && (
            <Overlay onClose={() => setFilterOpen(false)} side="left" width={264} label="絞り込み">
              <div className="overflow-y-auto px-4 py-4 h-full">{filterRail}</div>
            </Overlay>
          )}

          {/* 一覧 */}
          <main className="flex-1 min-w-0 overflow-y-auto px-3 md:px-5 py-4">
            {view === 'me' ? (
              <MyPanel likedCount={liked.size} onOpenApp={() => navigate('/mypage')} />
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                  <h1 className="text-[17px] font-bold">{viewTitle}</h1>
                  <span className="tabular-nums text-[12.5px]" style={{ color: 'var(--label-tertiary)' }}>
                    {items === null ? '読み込み中' : `${shown.length} 件`}
                  </span>
                  {activeCount > 0 && (
                    <button onClick={clearAll}
                      className="text-[11.5px] px-2 py-0.5 rounded-[6px] pressable"
                      style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' }}>
                      絞り込み {activeCount} ／ クリア
                    </button>
                  )}
                </div>

                {error && <p className="text-[13px]" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
                {items === null && !error && (
                  <div className={density === 'grid' ? 'wd-grid' : 'flex flex-col gap-2'}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="rounded-[12px] animate-pulse"
                        style={{ backgroundColor: 'var(--fill-quaternary)', height: density === 'grid' ? 268 : 96 }} />
                    ))}
                  </div>
                )}
                {items !== null && shown.length === 0 && (
                  <p className="text-[13px] py-10 text-center" style={{ color: 'var(--label-tertiary)' }}>
                    {view === 'saved'
                      ? 'まだいいねしていません。カードのハートを押すとここに溜まります。'
                      : '条件に合うものがありません。絞り込みを減らしてみてください。'}
                  </p>
                )}
                <div className={density === 'grid' ? 'wd-grid' : 'flex flex-col gap-2'}>
                  {shown.slice(0, 120).map((e) => (
                    <Card key={e.id} event={e} rows={density === 'rows'} active={e.id === openId}
                      liked={liked.has(e.id)} reaction={reactions[e.id]}
                      onOpen={() => setOpenId(e.id)}
                      onLike={() => toggleLike(e.id, e.title)}
                      onReact={() => setRxFor(e.id)} />
                  ))}
                </div>
                {shown.length > 120 && (
                  <p className="text-[12px] py-6 text-center" style={{ color: 'var(--label-tertiary)' }}>
                    ほか {shown.length - 120} 件（デモでは120件まで）
                  </p>
                )}
              </>
            )}
          </main>

          {/* 右パネル：xl 以上は3列目に。未満は右からかぶせる（押したのに無反応を作らない） */}
          {open && (
            <>
              <aside className="wd-detail hidden xl:flex flex-col flex-shrink-0 w-[368px] border-l overflow-y-auto min-h-0"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
                <DetailBody event={open} liked={liked.has(open.id)} reaction={reactions[open.id]}
                  onClose={() => setOpenId(null)} onLike={() => toggleLike(open.id, open.title)}
                  onReact={() => setRxFor(open.id)} say={say} />
              </aside>
              <div className="xl:hidden">
                <Overlay onClose={() => setOpenId(null)} side="right" width={392} label="詳細">
                  <div className="wd-detail flex flex-col h-full overflow-y-auto"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <DetailBody event={open} liked={liked.has(open.id)} reaction={reactions[open.id]}
                      onClose={() => setOpenId(null)} onLike={() => toggleLike(open.id, open.title)}
                      onReact={() => setRxFor(open.id)} say={say} />
                  </div>
                </Overlay>
              </div>
            </>
          )}
        </div>
      </div>

      {/* リアクションの選択 */}
      {rxFor && (
        <div className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setRxFor(null)}>
          <div className="w-full max-w-[360px] rounded-[14px] p-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-bold mb-3">どう思った？</div>
            <div className="grid grid-cols-3 gap-2">
              {REACTIONS.map((r) => {
                const on = reactions[rxFor] === r.type;
                return (
                  <button key={r.type} onClick={() => pickReaction(rxFor, r.type)}
                    className="wd-rx py-2.5 px-1 rounded-[10px] text-[11.5px] font-bold pressable"
                    style={on
                      ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
                      : { backgroundColor: 'var(--fill-quaternary)', color: 'var(--label-secondary)' }}>
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-3" style={{ color: 'var(--label-tertiary)' }}>
              同じものをもう一度押すと外れます
            </p>
          </div>
        </div>
      )}

      {notesOpen && <Notes onClose={() => setNotesOpen(false)} />}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[400] px-4 py-2.5 rounded-[10px] text-[13px] font-semibold pointer-events-none"
          style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)', animation: 'toastIn .22s cubic-bezier(.32,.72,0,1) both' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── 幅が足りないときにかぶせる箱 ───────────────────────── */
function Overlay({ children, onClose, side, width, label }: {
  children: React.ReactNode; onClose: () => void; side: 'left' | 'right'; width: number; label: string;
}) {
  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div
        className={`absolute top-0 bottom-0 ${side === 'left' ? 'left-0 border-r' : 'right-0 border-l'} flex flex-col`}
        style={{
          width: `min(${width}px, 88vw)`,
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)',
          animation: `${side === 'left' ? 'wdInLeft' : 'wdInRight'} .2s cubic-bezier(.32,.72,0,1) both`,
        }}>
        {children}
      </div>
    </div>
  );
}

/* ── サイドバーの中身 ───────────────────────────────── */
function SidebarBody({ view, setView, works, selectedWorks, onToggleWork, onPost, onNotes, likedCount }: {
  view: View; setView: (v: View) => void;
  works: [string, number][]; selectedWorks: Set<string>; onToggleWork: (w: string) => void;
  onPost: () => void; onNotes: () => void; likedCount: number;
}) {
  return (
    <>
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <div className="wd-logo text-[19px] font-bold tracking-tight">FanHive</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--label-tertiary)' }}>web版デモ</div>
      </div>
      <div className="px-3 pb-3 flex-shrink-0">
        <button onClick={onPost}
          className="wd-primary w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-[13px] font-bold pressable"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          <Plus size={16} strokeWidth={2.6} />投稿する
        </button>
      </div>
      <nav className="px-2 flex flex-col gap-0.5 flex-shrink-0">
        {VIEWS.map((n) => {
          const on = view === n.id;
          return (
            <button key={n.id} onClick={() => setView(n.id)}
              className="wd-nav w-full flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-[13px] text-left pressable"
              aria-current={on ? 'page' : undefined}
              style={on
                ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)', fontWeight: 700 }
                : { color: 'var(--label-secondary)' }}>
              <n.icon size={17} strokeWidth={on ? 2.4 : 1.8} />
              <span className="flex-1">{n.label}</span>
              {n.id === 'saved' && likedCount > 0 && (
                <span className="tabular-nums text-[11px]" style={{ color: 'var(--label-tertiary)' }}>{likedCount}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-4 pt-5 pb-1.5 text-[10px] font-bold tracking-[0.14em] flex-shrink-0"
        style={{ color: 'var(--label-tertiary)' }}>
        フォロー中の作品
      </div>
      <div className="px-2 flex-1 overflow-y-auto min-h-0">
        {works.slice(0, 10).map(([w, n]) => (
          <button key={w} onClick={() => onToggleWork(w)}
            className="wd-nav w-full flex items-center gap-2 px-3 py-1.5 rounded-[9px] text-[12.5px] text-left pressable"
            aria-pressed={selectedWorks.has(w)}
            style={selectedWorks.has(w)
              ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', fontWeight: 700 }
              : { color: 'var(--label-secondary)' }}>
            <Star size={13} className="flex-shrink-0" fill={selectedWorks.has(w) ? 'currentColor' : 'none'} />
            <span className="flex-1 truncate">{w}</span>
            <span className="tabular-nums text-[11px]" style={{ color: 'var(--label-tertiary)' }}>{n}</span>
          </button>
        ))}
      </div>
      <button onClick={onNotes}
        className="wd-nav flex items-center gap-2.5 px-5 py-3 text-[12.5px] border-t pressable text-left flex-shrink-0"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--label-secondary)' }}>
        <Settings size={15} />web版の設計メモ
      </button>
    </>
  );
}

/* ── 絞り込み ───────────────────────────────────── */
function FilterRail({ facets, mode, setMode, statuses, cats, prefs, onToggleStatus, onToggleCat, onTogglePref, activeCount, onClear }: {
  facets: { statuses: [ItemStatus, number][]; works: [string, number][]; cats: [string, number][]; prefs: [string, number][] };
  mode: 'all' | 'goods' | 'event'; setMode: (m: 'all' | 'goods' | 'event') => void;
  statuses: Set<ItemStatus>; cats: Set<string>; prefs: Set<string>;
  onToggleStatus: (s: ItemStatus) => void; onToggleCat: (c: string) => void; onTogglePref: (p: string) => void;
  activeCount: number; onClear: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-3">
        <SlidersHorizontal size={14} style={{ color: 'var(--label-secondary)' }} />
        <span className="text-[12px] font-bold flex-1">絞り込み</span>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-[11px] pressable" style={{ color: 'var(--accent-text)' }}>クリア</button>
        )}
      </div>
      <FilterGroup title="種類">
        {([['all', 'すべて'], ['goods', 'グッズ'], ['event', 'イベント']] as const).map(([m, l]) => (
          <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{l}</Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="状態">
        {facets.statuses.map(([s, n]) => (
          <Chip key={s} on={statuses.has(s)} onClick={() => onToggleStatus(s)} dot={statusColor(s)} count={n}>
            {statusLabel(s, 'goods')}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup title="カテゴリ">
        {facets.cats.map(([c, n]) => (
          <Chip key={c} on={cats.has(c)} onClick={() => onToggleCat(c)} count={n}>{c}</Chip>
        ))}
      </FilterGroup>
      {facets.prefs.length > 0 && (
        <FilterGroup title="地域">
          {facets.prefs.map(([p, n]) => (
            <Chip key={p} on={prefs.has(p)} onClick={() => onTogglePref(p)} count={n}>{p}</Chip>
          ))}
        </FilterGroup>
      )}
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold tracking-[0.14em] mb-1.5" style={{ color: 'var(--label-tertiary)' }}>{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children, count, dot }: {
  on: boolean; onClick: () => void; children: React.ReactNode; count?: number; dot?: string;
}) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className="wd-chip flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11.5px] pressable max-w-full"
      style={on
        ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)', fontWeight: 700 }
        : { backgroundColor: 'var(--fill-quaternary)', color: 'var(--label-secondary)', border: '1px solid var(--border-subtle)' }}>
      {dot && <i className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
      <span className="truncate">{children}</span>
      {count !== undefined && <span className="tabular-nums opacity-60 flex-shrink-0">{count}</span>}
    </button>
  );
}

/* ── 一覧の1件 ──────────────────────────────────── */
function Card({ event, rows, active, liked, reaction, onOpen, onLike, onReact }: {
  event: CalendarEvent; rows: boolean; active: boolean; liked: boolean; reaction?: ReactionType;
  onOpen: () => void; onLike: () => void; onReact: () => void;
}) {
  const st = deriveStatus(event);
  const img = parseImageUrls(event.imageUrl)[0];
  const price = yen(event.price);
  const catColor = getPrimaryCategoryColor(event.category);
  const rx = reaction ? REACTIONS.find((r) => r.type === reaction) : undefined;
  const likeCount = (event.likes ?? 0) + (liked ? 1 : 0);

  return (
    <article
      className={`wd-card group overflow-hidden rounded-[12px] border transition-colors ${rows ? 'flex gap-3 p-2' : 'flex flex-col'}`}
      style={{
        borderColor: active ? 'var(--accent-color)' : 'var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
      {/* 画像と本文はまるごと1つのボタン。押す場所を迷わせない */}
      <button onClick={onOpen}
        className={`text-left pressable ${rows ? 'flex gap-3 flex-1 min-w-0' : 'flex flex-col flex-1 min-w-0'}`}
        aria-label={`${event.title} の詳細を開く`}>
        <div className={`relative overflow-hidden flex-shrink-0 ${rows ? 'w-[104px] h-[104px] rounded-[8px]' : 'w-full aspect-square'}`}
          style={{ backgroundColor: 'var(--fill-quaternary)' }}>
          {img
            ? <OptImg src={img} w={384} alt="" loading="lazy" className="w-full h-full object-cover" />
            : <div className="w-full h-full" />}
          <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-[5px]"
            style={{ backgroundColor: statusColor(st), color: '#fff' }}>
            {statusLabel(st, deriveItemType(event))}
          </span>
        </div>
        <div className={rows ? 'flex-1 min-w-0 py-0.5' : 'px-2.5 pt-2 w-full min-w-0'}>
          {event.workName && <div className="text-[11px] truncate" style={{ color: 'var(--label-tertiary)' }}>{event.workName}</div>}
          <h3 className="wd-title text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5">{event.title}</h3>
          <div className="flex items-center gap-1 text-[11px] mb-1" style={{ color: 'var(--label-tertiary)' }}>
            {catColor && <i className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
            <span className="truncate">{parseCategories(event.category).join('・') || '—'}</span>
          </div>
          <div className="tabular-nums text-[11.5px] truncate" style={{ color: 'var(--label-secondary)' }}>{itemDateLines(event)[0]}</div>
          {price && <div className="tabular-nums text-[14px] font-bold mt-0.5" style={{ color: 'var(--accent-text)' }}>{price}</div>}
        </div>
      </button>
      {/* 操作は常に見えるところへ。画像に重ねると押す場所と競合する */}
      <div className={`wd-acts flex items-center gap-3 ${rows ? 'pr-2 flex-shrink-0' : 'px-2.5 pb-2 pt-1'}`}>
        <button onClick={onLike} aria-label="いいね"
          className="flex items-center gap-1 text-[11.5px] pressable"
          style={{ color: liked ? 'var(--accent-text)' : 'var(--label-secondary)' }}>
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
          {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
        </button>
        <button onClick={onReact} aria-label="リアクション"
          className="flex items-center gap-1 text-[11px] pressable"
          style={{ color: rx ? 'var(--accent-text)' : 'var(--label-secondary)' }}>
          {rx ? <span className="font-bold truncate max-w-[110px]">{rx.label}</span> : <SmilePlus size={15} />}
        </button>
      </div>
    </article>
  );
}

/* ── 詳細 ───────────────────────────────────────── */
function DetailBody({ event, liked, reaction, onClose, onLike, onReact, say }: {
  event: CalendarEvent; liked: boolean; reaction?: ReactionType;
  onClose: () => void; onLike: () => void; onReact: () => void; say: (m: string) => void;
}) {
  const st = deriveStatus(event);
  const img = parseImageUrls(event.imageUrl)[0];
  const offers = event.offers ?? [];
  const rx = reaction ? REACTIONS.find((r) => r.type === reaction) : undefined;
  const likeCount = (event.likes ?? 0) + (liked ? 1 : 0);

  const share = async () => {
    const url = `${window.location.origin}/item/${event.id}`;
    try { await navigator.clipboard.writeText(url); say('リンクをコピーしました'); }
    catch { say('コピーできませんでした'); }
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
        <span className="text-[12px] font-bold flex-1">詳細</span>
        <kbd className="hidden xl:block text-[10px] px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>Esc</kbd>
        <button onClick={onClose} aria-label="閉じる" className="pressable p-1"><X size={17} style={{ color: 'var(--label-secondary)' }} /></button>
      </div>
      <div className="aspect-square w-full overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--fill-quaternary)' }}>
        {img && <OptImg src={img} w={640} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="px-4 py-3">
        <span className="inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded-[5px]"
          style={{ backgroundColor: statusColor(st), color: '#fff' }}>
          {statusLabel(st, deriveItemType(event))}
        </span>
        {event.workName && <div className="text-[11.5px] mt-2" style={{ color: 'var(--label-tertiary)' }}>{event.workName}</div>}
        <h2 className="text-[16px] font-bold leading-snug mt-0.5 break-words">{event.title}</h2>
        <div className="tabular-nums text-[12px] mt-2 flex flex-col gap-0.5" style={{ color: 'var(--label-secondary)' }}>
          {itemDateLines(event).map((l) => <span key={l}>{l}</span>)}
        </div>
        {yen(event.price) && <div className="tabular-nums text-[20px] font-bold mt-2" style={{ color: 'var(--accent-text)' }}>{yen(event.price)}</div>}

        {/* 触る画面の4操作（いいね・リアクション・カレンダー・共有）は web でも同じ並び */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <DetailAct label="いいね" value={likeCount > 0 ? String(likeCount) : ''} on={liked} onClick={onLike}>
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
          </DetailAct>
          <DetailAct label="リアクション" value={rx ? rx.label : ''} on={!!rx} onClick={onReact}>
            <SmilePlus size={15} />
          </DetailAct>
          <DetailAct label="カレンダー" value="" on={false} onClick={() => say('カレンダーに追加しました')}>
            <CalendarPlus size={15} />
          </DetailAct>
          <DetailAct label="共有" value="" on={false} onClick={share}>
            <ExternalLink size={15} />
          </DetailAct>
        </div>

        {offers.length > 0 && (
          <>
            <div className="text-[10px] font-bold tracking-[0.14em] mt-4 mb-1.5" style={{ color: 'var(--label-tertiary)' }}>
              購入できるお店 {offers.length}
            </div>
            {offers.map((o, i) => (
              <a key={`${o.url}-${i}`} href={o.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 border-b text-[12.5px] pressable"
                style={{ borderColor: 'var(--border-faint)' }}>
                <span className="flex-1 truncate">{o.retailer || 'リンク'}</span>
                {typeof o.price === 'number' && <span className="tabular-nums font-bold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>{yen(o.price)}</span>}
                <ExternalLink size={13} className="flex-shrink-0" style={{ color: 'var(--label-tertiary)' }} />
              </a>
            ))}
          </>
        )}
        {event.memo && (
          <>
            <div className="text-[10px] font-bold tracking-[0.14em] mt-4 mb-1" style={{ color: 'var(--label-tertiary)' }}>メモ</div>
            <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--label-secondary)' }}>{event.memo}</p>
          </>
        )}
        <div className="h-4" />
      </div>
    </>
  );
}

function DetailAct({ label, value, on, onClick, children }: {
  label: string; value: string; on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={on}
      className="wd-act flex flex-col items-center gap-0.5 py-2 px-1 rounded-[9px] pressable min-w-0"
      style={on
        ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', border: '1px solid transparent' }
        : { backgroundColor: 'var(--fill-quaternary)', border: '1px solid var(--border-subtle)', color: 'var(--label-secondary)' }}>
      {children}
      <span className="text-[9.5px] truncate max-w-full" style={on ? undefined : { color: 'var(--label-tertiary)' }}>{label}</span>
      {value && <span className="tabular-nums text-[10px] font-bold truncate max-w-full">{value}</span>}
    </button>
  );
}

/* ── マイページ（web では一覧と同じ面に出す）───────────── */
function MyPanel({ likedCount, onOpenApp }: { likedCount: number; onOpenApp: () => void }) {
  const rows: [string, string][] = [
    ['発売・受付の通知', 'ON'],
    ['カレンダー連携', 'Google'],
    ['プレミアム', '有効'],
    ['アカウント', 'メールで引き継ぎ済み'],
  ];
  return (
    <div className="max-w-[620px]">
      <h1 className="text-[17px] font-bold mb-3">マイページ</h1>
      <div className="rounded-[12px] p-4 mb-3" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
        <div className="text-[10px] font-bold tracking-[0.14em] mb-2" style={{ color: 'var(--label-tertiary)' }}>記録</div>
        <div className="flex gap-6">
          {[['いいね', String(likedCount)], ['投稿', '42'], ['フォロー作品', '7']].map(([k, v]) => (
            <div key={k}>
              <div className="tabular-nums text-[22px] font-bold leading-none">{v}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--label-tertiary)' }}>{k}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
        <div className="text-[10px] font-bold tracking-[0.14em] px-4 pt-3 pb-1" style={{ color: 'var(--label-tertiary)' }}>設定</div>
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 px-4 py-3 border-t text-[13px]" style={{ borderColor: 'var(--border-faint)' }}>
            <span className="flex-1">{k}</span>
            <span className="text-[12px]" style={{ color: 'var(--label-tertiary)' }}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={onOpenApp}
        className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-bold pressable"
        style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
        <User size={15} />アプリ版のマイページを開く
      </button>
      <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: 'var(--label-tertiary)' }}>
        デモではここまで。実際の設定はアプリ版と同じものを、web の幅に合わせて並べ直します。
      </p>
    </div>
  );
}

/* ── 設計メモ ───────────────────────────────────── */
function Notes({ onClose }: { onClose: () => void }) {
  const rows: [string, string, string][] = [
    ['主ナビ', '画面下のタブ5つ', '左サイドバーに常時表示。幅が足りないときは ≡ からかぶせる'],
    ['検索', '画面の中に置く', '上部バーに常設。/ キーで飛べる'],
    ['絞り込み', 'シートで開く（モーダル）', '左に常時表示。1024px 未満だけ、つまみのボタンからかぶせる'],
    ['一覧', '1〜2列', '幅に応じて2〜5列。グリッド／リストを選べる'],
    ['詳細', '画面が切り替わる', '1280px 以上は右の3列目。未満は右からかぶせる（押して無反応にしない）'],
    ['投稿', '下タブ中央の＋', 'サイドバー上部の主ボタン'],
    ['操作', '常に見えている', 'カードの下に常時。画像に重ねると押す場所と競合するのでやめた'],
    ['戻る', '端のスワイプ', 'ブラウザの戻る＋Esc（開いているものを上から順に閉じる）'],
  ];
  return (
    <div className="fixed inset-0 z-[330] flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="max-w-[720px] w-full max-h-[84vh] overflow-y-auto rounded-[14px] p-5 sm:p-6"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <h2 className="text-[18px] font-bold flex-1">web版で変えたところ</h2>
          <button onClick={onClose} aria-label="閉じる" className="pressable p-1"><X size={18} /></button>
        </div>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--label-secondary)' }}>
          触る画面をそのまま横に伸ばすのではなく、web の作法に置き直しています。
          主ナビは左のサイドバー、検索などの共通機能は上部バー、詳細は画面遷移ではなく右パネル
          （全体 → 作業 → 詳細を同時に見せる三列構成）。絞り込みはデスクトップではモーダルにせず常時表示にしました。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--label-tertiary)' }}>
                <th className="text-left font-normal py-1.5 pr-3">項目</th>
                <th className="text-left font-normal py-1.5 pr-3">アプリ版</th>
                <th className="text-left font-normal py-1.5">web版</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, a, b]) => (
                <tr key={k} style={{ borderTop: '1px solid var(--border-faint)' }}>
                  <td className="py-2 pr-3 font-bold whitespace-nowrap align-top">{k}</td>
                  <td className="py-2 pr-3 align-top" style={{ color: 'var(--label-tertiary)' }}>{a}</td>
                  <td className="py-2 align-top" style={{ color: 'var(--label-secondary)' }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] mt-4 leading-relaxed" style={{ color: 'var(--label-tertiary)' }}>
          3つの見た目（現行 / PANEL / SURGE）は、アプリ版と同じ CSS 変数と data-skin を使っています。
          この画面のための配色は1つも書いていません。右上のセレクタで切り替わります。
        </p>
        <p className="text-[11.5px] mt-2 leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--label-tertiary)' }}>
          <Check size={13} className="flex-shrink-0 mt-0.5" />
          いいね・リアクションはこの画面の中だけで動きます（サーバーには書き込みません）。
        </p>
      </div>
    </div>
  );
}
