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
// 3つの外皮（現行 / PANEL / SURGE）はそのまま効く。CSS変数と data-skin を
// アプリ版と共有しているため、この画面のためのテーマは書いていない。
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Home, Search, Heart, User, Plus, SlidersHorizontal, Bell, X, ExternalLink,
  LayoutGrid, Rows3, Star, Settings, SmilePlus, ChevronRight,
} from 'lucide-react';
import { listExploreEvents } from '../lib/api';
import { parseCategories, parseImageUrls, getPrimaryCategoryColor } from '../lib/constants';
import { deriveStatus, deriveItemType, statusLabel, itemDateLines, todayStr, type ItemStatus } from '../design/tokens';
import { SKINS, SKIN_IDS } from '../design/skins';
import { useTheme } from '../contexts/ThemeContext';
import OptImg from '../components/ui/OptImg';
import type { CalendarEvent } from '../types';

type Density = 'grid' | 'rows';

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
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [density, setDensity] = useState<Density>('grid');
  const [mode, setMode] = useState<'all' | 'goods' | 'event'>('all');
  const [statuses, setStatuses] = useState<Set<ItemStatus>>(new Set());
  const [works, setWorks] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // 一覧は「探す」と同じ取得口を使う。デモ用のダミーではなく本物のデータ
  useEffect(() => {
    const today = todayStr();
    const to = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
    listExploreEvents(today, to)
      .then((r) => setItems(r))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'));
  }, []);

  // キーボードの近道: / で検索へ、Esc で詳細を閉じる（web ならではの層）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { if (openId) setOpenId(null); else (document.activeElement as HTMLElement)?.blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const toggle = useCallback(<T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    fn(next);
  }, []);

  // 件数つきの候補。絞り込みは常時表示なので、件数が見えることが効く
  const facets = useMemo(() => {
    const base = items ?? [];
    const st = new Map<ItemStatus, number>();
    const wk = new Map<string, number>();
    const ct = new Map<string, number>();
    const pf = new Map<string, number>();
    for (const e of base) {
      st.set(deriveStatus(e), (st.get(deriveStatus(e)) ?? 0) + 1);
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
    return (items ?? []).filter((e) => {
      if (mode !== 'all' && deriveItemType(e) !== mode) return false;
      if (statuses.size && !statuses.has(deriveStatus(e))) return false;
      if (works.size && !(e.workName && works.has(e.workName))) return false;
      if (cats.size && !parseCategories(e.category).some((c) => cats.has(c))) return false;
      if (prefs.size && !(e.prefecture && prefs.has(e.prefecture))) return false;
      if (q && !`${e.title} ${e.workName ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, mode, statuses, works, cats, prefs]);

  const activeCount = statuses.size + works.size + cats.size + prefs.size + (mode !== 'all' ? 1 : 0);
  const clearAll = () => {
    setStatuses(new Set()); setWorks(new Set()); setCats(new Set()); setPrefs(new Set()); setMode('all');
  };
  const open = shown.find((e) => e.id === openId) ?? null;

  return (
    <div className="web-demo min-h-[100dvh] flex" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--label-primary)' }}>
      {/* ── 左サイドバー：主ナビは常時表示。触る画面の下タブに当たる ── */}
      <aside className="wd-side hidden md:flex flex-col flex-shrink-0 w-[232px] border-r"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="px-4 pt-5 pb-4">
          <div className="wd-logo text-[19px] font-bold tracking-tight">FanHive</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--label-tertiary)' }}>web版デモ</div>
        </div>
        {/* 投稿は web では主ボタン。下タブ中央の＋に当たる */}
        <div className="px-3 pb-3">
          <button className="wd-primary w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-[13px] font-bold pressable"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            <Plus size={16} strokeWidth={2.6} />投稿する
          </button>
        </div>
        <nav className="px-2 flex flex-col gap-0.5">
          {[
            { icon: Home, label: 'ホーム' },
            { icon: Search, label: '探す', on: true },
            { icon: Heart, label: 'いいね' },
            { icon: User, label: 'マイページ' },
          ].map((n) => (
            <button key={n.label}
              className="wd-nav w-full flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-[13px] text-left pressable"
              aria-current={n.on ? 'page' : undefined}
              style={n.on
                ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)', fontWeight: 700 }
                : { color: 'var(--label-secondary)' }}>
              <n.icon size={17} strokeWidth={n.on ? 2.4 : 1.8} />{n.label}
            </button>
          ))}
        </nav>
        {/* フォロー中の作品：触る画面ではシートの中。web は場所があるので出しておく */}
        <div className="px-4 pt-5 pb-1.5 text-[10px] font-bold tracking-[0.14em]" style={{ color: 'var(--label-tertiary)' }}>
          フォロー中の作品
        </div>
        <div className="px-2 flex-1 overflow-y-auto">
          {facets.works.slice(0, 8).map(([w, n]) => (
            <button key={w} onClick={() => toggle(works, w, setWorks)}
              className="wd-nav w-full flex items-center gap-2 px-3 py-1.5 rounded-[9px] text-[12.5px] text-left pressable"
              style={works.has(w)
                ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', fontWeight: 700 }
                : { color: 'var(--label-secondary)' }}>
              <Star size={13} className="flex-shrink-0" />
              <span className="flex-1 truncate">{w}</span>
              <span className="tabular-nums text-[11px]" style={{ color: 'var(--label-tertiary)' }}>{n}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setNotesOpen(true)}
          className="wd-nav flex items-center gap-2.5 px-5 py-3 text-[12.5px] border-t pressable text-left"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--label-secondary)' }}>
          <Settings size={15} />web版の設計メモ<ChevronRight size={14} className="ml-auto" />
        </button>
      </aside>

      {/* ── 中央 ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 上部バー：検索・通知・アカウント等の共通機能はここ（サイドバーには置かない） */}
        <header className="wd-top sticky top-0 z-20 flex items-center gap-3 px-4 md:px-6 py-3 border-b"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="wd-search flex items-center gap-2 flex-1 max-w-[620px] px-3 py-2 rounded-[10px]"
            style={{ backgroundColor: 'var(--fill-quaternary)', border: '1px solid var(--border-subtle)' }}>
            <Search size={16} style={{ color: 'var(--label-tertiary)' }} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="グッズ・イベントを検索"
              className="flex-1 bg-transparent outline-none text-[13.5px]"
              style={{ color: 'var(--input-text)' }} />
            {query
              ? <button onClick={() => setQuery('')} aria-label="クリア" className="pressable"><X size={15} style={{ color: 'var(--label-tertiary)' }} /></button>
              : <kbd className="wd-kbd text-[10px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>/</kbd>}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {/* 表示の密度。web は幅があるので使う人に選ばせる */}
            {([['grid', LayoutGrid], ['rows', Rows3]] as const).map(([d, Icon]) => (
              <button key={d} onClick={() => setDensity(d)} aria-label={d === 'grid' ? 'グリッド表示' : 'リスト表示'}
                className="wd-icon p-2 rounded-[9px] pressable"
                style={density === d ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' } : { color: 'var(--label-tertiary)' }}>
                <Icon size={17} />
              </button>
            ))}
            <button aria-label="お知らせ" className="wd-icon p-2 rounded-[9px] pressable" style={{ color: 'var(--label-tertiary)' }}>
              <Bell size={17} />
            </button>
            {/* 外皮の切り替え。アプリのマイページと同じ層を web からも触れるようにした */}
            <select value={skin} onChange={(e) => setSkin(e.target.value as typeof skin)}
              aria-label="見た目"
              className="wd-select text-[12px] px-2.5 py-2 rounded-[9px] outline-none"
              style={{ backgroundColor: 'var(--fill-quaternary)', color: 'var(--label-secondary)', border: '1px solid var(--border-subtle)' }}>
              {SKIN_IDS.map((id) => <option key={id} value={id}>{SKINS[id].name}</option>)}
            </select>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* 絞り込み：デスクトップではモーダルにせず常時表示 */}
          <aside className="wd-filters hidden lg:block flex-shrink-0 w-[212px] border-r overflow-y-auto px-4 py-4"
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-1.5 mb-3">
              <SlidersHorizontal size={14} style={{ color: 'var(--label-secondary)' }} />
              <span className="text-[12px] font-bold flex-1">絞り込み</span>
              {activeCount > 0 && (
                <button onClick={clearAll} className="text-[11px] pressable" style={{ color: 'var(--accent-text)' }}>クリア</button>
              )}
            </div>
            <FilterGroup title="種類">
              {([['all', 'すべて'], ['goods', 'グッズ'], ['event', 'イベント']] as const).map(([m, l]) => (
                <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{l}</Chip>
              ))}
            </FilterGroup>
            <FilterGroup title="状態">
              {facets.statuses.map(([s, n]) => (
                <Chip key={s} on={statuses.has(s)} onClick={() => toggle(statuses, s, setStatuses)} dot={statusColor(s)} count={n}>
                  {statusLabel(s, 'goods')}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup title="カテゴリ">
              {facets.cats.map(([c, n]) => (
                <Chip key={c} on={cats.has(c)} onClick={() => toggle(cats, c, setCats)} count={n}>{c}</Chip>
              ))}
            </FilterGroup>
            {facets.prefs.length > 0 && (
              <FilterGroup title="地域">
                {facets.prefs.map(([p, n]) => (
                  <Chip key={p} on={prefs.has(p)} onClick={() => toggle(prefs, p, setPrefs)} count={n}>{p}</Chip>
                ))}
              </FilterGroup>
            )}
          </aside>

          {/* 一覧 */}
          <main className="flex-1 min-w-0 overflow-y-auto px-4 md:px-6 py-4">
            <div className="flex items-baseline gap-2 mb-3">
              <h1 className="text-[17px] font-bold">探す</h1>
              <span className="tabular-nums text-[12.5px]" style={{ color: 'var(--label-tertiary)' }}>
                {items === null ? '読み込み中' : `${shown.length} 件`}
              </span>
              {activeCount > 0 && (
                <span className="text-[11.5px] px-2 py-0.5 rounded-[6px]"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' }}>
                  絞り込み {activeCount}
                </span>
              )}
            </div>

            {error && <p className="text-[13px]" style={{ color: 'var(--color-destructive)' }}>{error}</p>}
            {items === null && !error && (
              <div className={density === 'grid' ? 'wd-grid' : 'flex flex-col gap-2'}>
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="rounded-[12px] animate-pulse" style={{ backgroundColor: 'var(--fill-quaternary)', height: density === 'grid' ? 250 : 92 }} />
                ))}
              </div>
            )}
            {items !== null && shown.length === 0 && (
              <p className="text-[13px] py-10 text-center" style={{ color: 'var(--label-tertiary)' }}>
                条件に合うものがありません。絞り込みを減らしてみてください。
              </p>
            )}
            <div className={density === 'grid' ? 'wd-grid' : 'flex flex-col gap-2'}>
              {shown.slice(0, 120).map((e) => (
                <Card key={e.id} event={e} rows={density === 'rows'} active={e.id === openId} onOpen={() => setOpenId(e.id)} />
              ))}
            </div>
          </main>

          {/* 右パネル：詳細は画面遷移せずここに出す。一覧を見失わない */}
          {open && <DetailPanel event={open} onClose={() => setOpenId(null)} />}
        </div>
      </div>

      {notesOpen && <Notes onClose={() => setNotesOpen(false)} />}
    </div>
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
      className="wd-chip flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11.5px] pressable"
      style={on
        ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)', fontWeight: 700 }
        : { backgroundColor: 'var(--fill-quaternary)', color: 'var(--label-secondary)', border: '1px solid var(--border-subtle)' }}>
      {dot && <i className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />}
      <span className="truncate max-w-[120px]">{children}</span>
      {count !== undefined && <span className="tabular-nums opacity-60">{count}</span>}
    </button>
  );
}

function Card({ event, rows, active, onOpen }: { event: CalendarEvent; rows: boolean; active: boolean; onOpen: () => void }) {
  const st = deriveStatus(event);
  const img = parseImageUrls(event.imageUrl)[0];
  const price = yen(event.price);
  const catColor = getPrimaryCategoryColor(event.category);
  return (
    <article
      onClick={onOpen}
      className={`wd-card group cursor-pointer overflow-hidden rounded-[12px] border transition-colors ${rows ? 'flex gap-3 p-2' : 'flex flex-col'}`}
      style={{
        borderColor: active ? 'var(--accent-color)' : 'var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
      <div className={`relative overflow-hidden flex-shrink-0 ${rows ? 'w-[104px] h-[104px] rounded-[8px]' : 'w-full aspect-square'}`}
        style={{ backgroundColor: 'var(--fill-quaternary)' }}>
        {img
          ? <OptImg src={img} w={384} alt={event.title} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full" />}
        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-[5px]"
          style={{ backgroundColor: statusColor(st), color: '#fff' }}>
          {statusLabel(st, deriveItemType(event))}
        </span>
        {/* ホバーで出る操作。触る画面には無い層なので、web だけ足している */}
        <div className="wd-hover absolute inset-x-1.5 bottom-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(ev) => ev.stopPropagation()} aria-label="いいね"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[8px] text-[11px] font-bold"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--label-primary)', border: '1px solid var(--border-default)' }}>
            <Heart size={13} />{event.likes || ''}
          </button>
          <button onClick={(ev) => ev.stopPropagation()} aria-label="リアクション"
            className="px-2.5 py-1.5 rounded-[8px]"
            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--label-primary)', border: '1px solid var(--border-default)' }}>
            <SmilePlus size={13} />
          </button>
        </div>
      </div>
      <div className={rows ? 'flex-1 min-w-0 py-0.5' : 'px-2.5 py-2'}>
        {event.workName && <div className="text-[11px] truncate" style={{ color: 'var(--label-tertiary)' }}>{event.workName}</div>}
        <h3 className="text-[13px] font-semibold leading-snug line-clamp-2 mb-0.5">{event.title}</h3>
        <div className="flex items-center gap-1 text-[11px] mb-1" style={{ color: 'var(--label-tertiary)' }}>
          {catColor && <i className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
          <span className="truncate">{parseCategories(event.category).join('・') || '—'}</span>
        </div>
        <div className="tabular-nums text-[11.5px]" style={{ color: 'var(--label-secondary)' }}>{itemDateLines(event)[0]}</div>
        {price && <div className="tabular-nums text-[14px] font-bold mt-0.5" style={{ color: 'var(--accent-text)' }}>{price}</div>}
        {/* リスト表示では操作を常に出す（ホバーを探させない） */}
        {rows && (
          <div className="flex items-center gap-3 mt-1.5">
            <button onClick={(ev) => ev.stopPropagation()} aria-label="いいね" className="flex items-center gap-1 text-[11.5px] pressable" style={{ color: 'var(--label-secondary)' }}>
              <Heart size={14} />{event.likes || 0}
            </button>
            <button onClick={(ev) => ev.stopPropagation()} aria-label="リアクション" className="pressable" style={{ color: 'var(--label-secondary)' }}>
              <SmilePlus size={14} />
            </button>
            <button onClick={(ev) => ev.stopPropagation()} aria-label="通知" className="pressable" style={{ color: 'var(--label-secondary)' }}>
              <Bell size={14} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function DetailPanel({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const st = deriveStatus(event);
  const img = parseImageUrls(event.imageUrl)[0];
  const offers = event.offers ?? [];
  return (
    <aside className="wd-detail hidden xl:flex flex-col flex-shrink-0 w-[368px] border-l overflow-y-auto"
      style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="sticky top-0 flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}>
        <span className="text-[12px] font-bold flex-1">詳細</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>Esc</kbd>
        <button onClick={onClose} aria-label="閉じる" className="pressable p-1"><X size={16} style={{ color: 'var(--label-secondary)' }} /></button>
      </div>
      <div className="aspect-square w-full overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--fill-quaternary)' }}>
        {img && <OptImg src={img} w={640} alt={event.title} className="w-full h-full object-cover" />}
      </div>
      <div className="px-4 py-3">
        <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-[5px]" style={{ backgroundColor: statusColor(st), color: '#fff' }}>
          {statusLabel(st, deriveItemType(event))}
        </span>
        {event.workName && <div className="text-[11.5px] mt-2" style={{ color: 'var(--label-tertiary)' }}>{event.workName}</div>}
        <h2 className="text-[16px] font-bold leading-snug mt-0.5">{event.title}</h2>
        <div className="tabular-nums text-[12px] mt-2 flex flex-col gap-0.5" style={{ color: 'var(--label-secondary)' }}>
          {itemDateLines(event).map((l) => <span key={l}>{l}</span>)}
        </div>
        {yen(event.price) && <div className="tabular-nums text-[20px] font-bold mt-2" style={{ color: 'var(--accent-text)' }}>{yen(event.price)}</div>}

        {/* 触る画面の4操作（いいね・リアクション・カレンダー・共有）は web でも同じ並び */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          {[
            { icon: Heart, label: 'いいね', v: String(event.likes || 0) },
            { icon: SmilePlus, label: 'リアクション', v: '' },
            { icon: Plus, label: 'カレンダー', v: '' },
            { icon: ExternalLink, label: '共有', v: '' },
          ].map((a) => (
            <button key={a.label} aria-label={a.label}
              className="wd-act flex flex-col items-center gap-0.5 py-2 rounded-[9px] pressable"
              style={{ backgroundColor: 'var(--fill-quaternary)', border: '1px solid var(--border-subtle)' }}>
              <a.icon size={15} style={{ color: 'var(--label-secondary)' }} />
              <span className="text-[9.5px]" style={{ color: 'var(--label-tertiary)' }}>{a.label}</span>
              {a.v && <span className="tabular-nums text-[10px] font-bold" style={{ color: 'var(--label-secondary)' }}>{a.v}</span>}
            </button>
          ))}
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
                {typeof o.price === 'number' && <span className="tabular-nums font-bold" style={{ color: 'var(--accent-text)' }}>{yen(o.price)}</span>}
                <ExternalLink size={13} style={{ color: 'var(--label-tertiary)' }} />
              </a>
            ))}
          </>
        )}
        {event.memo && (
          <>
            <div className="text-[10px] font-bold tracking-[0.14em] mt-4 mb-1" style={{ color: 'var(--label-tertiary)' }}>メモ</div>
            <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--label-secondary)' }}>{event.memo}</p>
          </>
        )}
      </div>
    </aside>
  );
}

function Notes({ onClose }: { onClose: () => void }) {
  const rows: [string, string, string][] = [
    ['主ナビ', '画面下のタブ5つ', '左サイドバーに常時表示。作品のフォロー一覧もそこに出す'],
    ['検索', '画面の中に置く', '上部バーに常設。/ キーで飛べる'],
    ['絞り込み', 'シートで開く（モーダル）', '左に常時表示。開閉なしで条件を足し引きできる'],
    ['一覧', '1〜2列', '幅に応じて2〜5列。グリッド／リストを選べる'],
    ['詳細', '画面が切り替わる', '右パネルで開く。一覧を見失わない（Esc で閉じる）'],
    ['投稿', '下タブ中央の＋', 'サイドバー上部の主ボタン'],
    ['操作', '常に見えている', 'カードはホバーで出す。リスト表示では常に出す'],
    ['戻る', '端のスワイプ', 'ブラウザの戻る＋Esc'],
  ];
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="max-w-[720px] w-full max-h-[80vh] overflow-y-auto rounded-[14px] p-6"
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
                  <td className="py-2 pr-3 font-bold whitespace-nowrap">{k}</td>
                  <td className="py-2 pr-3" style={{ color: 'var(--label-tertiary)' }}>{a}</td>
                  <td className="py-2" style={{ color: 'var(--label-secondary)' }}>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] mt-4" style={{ color: 'var(--label-tertiary)' }}>
          3つの見た目（現行 / PANEL / SURGE）は、アプリ版と同じ CSS 変数と data-skin を使っています。
          この画面のための配色は1つも書いていません。右上のセレクタで切り替わります。
        </p>
      </div>
    </div>
  );
}
