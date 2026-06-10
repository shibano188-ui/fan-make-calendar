import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, MoreVertical, LogOut, Trash2, Check, Palette, Map as MapIcon } from 'lucide-react';
import Layout from '../components/Layout';
import SettingsMenuButton from '../components/SettingsMenuButton';
import { listWorks, searchWorks, getOrCreateWork, getWorkById, upsertParticipation, listRecentWorks, leaveCalendar, deleteWork, getHomePrefecture } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Work } from '../lib/api';
import { POST_CATEGORIES, loadCategoryFilters, saveCategoryFilters, loadRegionFilter, saveRegionFilter, type FilterMode } from '../lib/constants';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { haptic } from '../lib/haptics';

function formatCount(n: number): string {
  return n.toLocaleString('ja-JP');
}

function WorkItem({
  name,
  count,
  onClick,
  participated = false,
}: {
  name: string;
  count: number;
  onClick: () => void;
  participated?: boolean;
}) {
  return (
    <button
      onClick={participated ? undefined : onClick}
      disabled={participated}
      className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-secondary rounded-[14px] text-left transition-opacity disabled:opacity-100"
      style={participated ? { cursor: 'default' } : undefined}
    >
      <div>
        <p className={`font-semibold text-[15px] ${participated ? 'text-label-secondary' : 'text-label-primary'}`}>{name}</p>
        <p className="text-label-secondary text-xs mt-0.5">参加者 {formatCount(count)}人</p>
      </div>
      {participated ? (
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <Check size={14} style={{ color: 'var(--accent-color)' }} />
          <span className="text-xs" style={{ color: 'var(--accent-color)' }}>参加済み</span>
        </div>
      ) : (
        <ChevronRight size={16} className="text-label-tertiary flex-shrink-0 ml-2" />
      )}
    </button>
  );
}

function ParticipatedWorkItem({
  work,
  onLeave,
  onDelete,
}: {
  work: Work;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      <div className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-secondary rounded-[14px]">
        <div>
          <p className="text-label-primary font-semibold text-[15px]">{work.name}</p>
          <p className="text-label-secondary text-xs mt-0.5">参加者 {formatCount(work.participantCount)}人</p>
        </div>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-label-secondary active:opacity-60"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-subtle rounded-[14px] overflow-hidden shadow-lg w-48">
                <button
                  onClick={() => { setMenuOpen(false); onLeave(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60"
                >
                  <LogOut size={14} className="text-label-secondary" />カレンダーから抜ける
                </button>
                <div className="h-px bg-subtle mx-3" />
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60"
                >
                  <Trash2 size={14} />カレンダーを削除
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-label-secondary text-xs mb-2 px-1">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export default function WorkSelect() {

  const navigate = useNavigate();
  const { user } = useAuth();
  const confirmDialog = useConfirm();

  // 地域フィルター（Calendar/Discoverと共有）
  const [filterMode, setFilterMode] = useState<FilterMode>(() => loadRegionFilter().filterMode);
  const [filterValue, setFilterValue] = useState<string | null>(() => loadRegionFilter().filterValue);
  const [includeAdjacent, setIncludeAdjacent] = useState(() => loadRegionFilter().includeAdjacent);
  const [showRegionPanel, setShowRegionPanel] = useState(false);
  const [homePref, setHomePref] = useState<string | null>(null);

  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref' ? filterValue ?? '' : filterMode === 'region' ? `${filterValue}地方` : '';
  const [query, setQuery] = useState('');
  const [popularWorks, setPopularWorks] = useState<Work[]>([]);
  const [recentWorks, setRecentWorks] = useState<Work[]>([]);
  const [searchResults, setSearchResults] = useState<Work[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [error, setError] = useState('');
  const [pendingWork, setPendingWork] = useState<Work | null>(null);
  const [pendingCats, setPendingCats] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listWorks()
      .then(setPopularWorks)
      .catch(() => setError('作品の読み込みに失敗しました'))
      .finally(() => setLoadingPopular(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    listRecentWorks(user.id).then(setRecentWorks).catch(console.error);
    getHomePrefecture(user.id).then(setHomePref).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      searchWorks(q).then(setSearchResults).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // 既存フィルター(除外リスト)から「表示するカテゴリ」に変換してポップアップ初期値を設定
  const initPendingCats = (workId: string) => {
    const existing = loadCategoryFilters();
    const excludes = existing[workId];
    // 初回参加(excludes=undefined)はデフォルト全表示 = 全選択
    // 再参加時は除外されていないカテゴリを選択済みにする
    const includes = excludes !== undefined
      ? POST_CATEGORIES.filter(c => !excludes.includes(c))
      : [...POST_CATEGORIES];
    setPendingCats(includes);
  };

  const handleSelect = async (work: Work) => {
    if (!user) return;
    try {
      await upsertParticipation(work.id, user.id);
      initPendingCats(work.id);
      const updated = await getWorkById(work.id) ?? work;
      setPendingWork(updated);
      setPopularWorks(prev => prev.map(w => w.id === updated.id ? updated : w));
      setSearchResults(prev => prev.map(w => w.id === updated.id ? updated : w));
    } catch {
      setError('参加に失敗しました');
    }
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || !user) return;
    try {
      const work = await getOrCreateWork(name);
      await upsertParticipation(work.id, user.id);
      initPendingCats(work.id);
      const updated = await getWorkById(work.id) ?? work;
      setPendingWork(updated);
    } catch {
      setError('作品の作成に失敗しました');
    }
  };

  const handleLeave = async (work: Work) => {
    if (!user) return;
    if (!(await confirmDialog({ title: '作品から抜ける', message: `「${work.name}」から抜けますか？`, confirmLabel: '抜ける', destructive: true }))) return;
    try {
      await leaveCalendar(work.id, user.id);
      setRecentWorks(prev => prev.filter(w => w.id !== work.id));
    } catch {
      setError('操作に失敗しました');
    }
  };

  const handleDelete = async (work: Work) => {
    if (!user) return;
    if (!(await confirmDialog({ title: '作品を完全に削除', message: `「${work.name}」を完全に削除しますか？\nこの操作は元に戻せません。`, confirmLabel: '削除', destructive: true }))) return;
    try {
      await deleteWork(work.id);
      setRecentWorks(prev => prev.filter(w => w.id !== work.id));
      setPopularWorks(prev => prev.filter(w => w.id !== work.id));
    } catch {
      setError('削除に失敗しました');
    }
  };

  const q = query.trim();
  const exactMatch = q ? searchResults.some(w => w.name.toLowerCase() === q.toLowerCase()) : false;
  const canCreate = q.length > 0 && !exactMatch;
  const showSearchResults = q.length > 0;
  const noResults = showSearchResults && searchResults.length === 0;

  return (
    <Layout>
      <div className="px-5 pt-8 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-label-primary">作品を選ぶ</h1>
            <p className="text-sm text-label-secondary mt-1">入りたいカレンダーを検索</p>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={() => setShowRegionPanel(true)}
              aria-label="地域で絞り込む"
              className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
            >
              <MapIcon size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
              {filterActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />}
            </button>
            <button
              onClick={() => navigate('/customize')}
              aria-label="カスタマイズ"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
            >
              <Palette size={16} />
            </button>
            <SettingsMenuButton />
          </div>
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center gap-3 bg-fill-3 rounded-[10px] h-9 px-3">
          <Search size={16} className="text-label-tertiary flex-shrink-0" />
          <input
            type="text"
            placeholder="作品名で検索"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-label-primary caret-label-primary placeholder:text-label-tertiary text-sm outline-none"
          />
        </div>
      </div>

      {error && <p className="px-5 mb-4 text-red-400 text-xs">{error}</p>}

      <div className="px-5">
        {showSearchResults ? (
          <>
            {searchResults.length > 0 && (
              <Section title="検索結果">
                {searchResults.map(w => {
                  const already = recentWorks.some(r => r.id === w.id);
                  return (
                    <WorkItem
                      key={w.id}
                      name={w.name}
                      count={w.participantCount}
                      onClick={() => handleSelect(w)}
                      participated={already}
                    />
                  );
                })}
              </Section>
            )}

            {noResults && (
              <p className="text-label-tertiary text-sm text-center py-4">「{q}」に一致する作品が見つかりません</p>
            )}

            {canCreate && (
              <div className="mt-2">
                <button
                  onClick={handleCreate}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] text-left active:opacity-70 transition-opacity"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-color)' }}
                >
                  <div>
                    <p className="font-semibold text-[15px]">「{q}」を新しく作る</p>
                    <p className="text-xs mt-0.5 opacity-70">このカレンダーを最初に作成する</p>
                  </div>
                  <ChevronRight size={16} className="flex-shrink-0 ml-2 opacity-60" />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {recentWorks.length > 0 && (
              <Section title="参加中のカレンダー">
                {recentWorks.map(w => (
                  <ParticipatedWorkItem
                    key={w.id}
                    work={w}
                    onLeave={() => handleLeave(w)}
                    onDelete={() => handleDelete(w)}
                  />
                ))}
              </Section>
            )}

            {loadingPopular ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-[14px] animate-pulse" />)}
              </div>
            ) : popularWorks.length > 0 ? (
              <Section title="人気のカレンダー">
                {popularWorks.map(w => {
                  const already = recentWorks.some(r => r.id === w.id);
                  return (
                    <WorkItem
                      key={w.id}
                      name={w.name}
                      count={w.participantCount}
                      onClick={() => handleSelect(w)}
                      participated={already}
                    />
                  );
                })}
              </Section>
            ) : (
              <p className="text-center text-label-tertiary text-sm py-10">
                まだカレンダーがありません。<br />作品名を検索して最初のカレンダーを作りましょう。
              </p>
            )}
          </>
        )}
      </div>

      {pendingWork && (
        <>
          <div className="fixed inset-0 z-[150] bg-black/40" onClick={() => setPendingWork(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-[160] max-w-app mx-auto rounded-t-[18px] overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="px-5 pt-5 pb-4">
              {/* タイトル */}
              <p className="text-label-primary font-semibold text-[15px] mb-1">表示するカテゴリを選択</p>
              <p className="text-label-secondary text-xs mb-3">非表示にしたいカテゴリをタップして解除（後からでも変更できます）</p>

              {/* カテゴリ選択 + 全て表示ボタン */}
              <div className="flex flex-wrap gap-2 mb-2">
                {POST_CATEGORIES.map(cat => {
                  const active = pendingCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => setPendingCats(prev => active ? prev.filter(c => c !== cat) : [...prev, cat])}
                      className="px-3 py-1.5 rounded-full text-xs transition-colors active:opacity-70"
                      style={active ? {
                        color: 'var(--accent-color)',
                        backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)',
                      } : {
                        color: 'var(--label-secondary)',
                        backgroundColor: 'var(--fill-tertiary)',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPendingCats([...POST_CATEGORIES])}
                  className="px-3 py-1.5 rounded-full text-xs transition-colors active:opacity-70"
                  style={{
                    color: 'var(--label-tertiary)',
                    backgroundColor: 'var(--fill-tertiary)',
                  }}
                >
                  全て表示
                </button>
              </div>

              {pendingCats.length > 0 && pendingCats.length < POST_CATEGORIES.length && (
                <p className="text-[11px] text-label-tertiary mb-3">
                  {pendingCats.join('・')} のみ表示
                </p>
              )}
              {pendingCats.length === POST_CATEGORIES.length && (
                <p className="text-[11px] text-label-tertiary mb-3">全カテゴリを表示</p>
              )}
              {pendingCats.length === 0 && (
                <p className="text-[11px] text-yellow-500 mb-3">全カテゴリが非表示になります</p>
              )}

              {/* 参加ボタン（カレンダーへ移動しない） */}
              <button
                onClick={() => {
                  const excludeCats = pendingCats.length === POST_CATEGORIES.length
                    ? []
                    : POST_CATEGORIES.filter(c => !pendingCats.includes(c));
                  const updated = { ...loadCategoryFilters(), [pendingWork.id]: excludeCats };
                  saveCategoryFilters(updated);
                  if (!recentWorks.some(w => w.id === pendingWork.id)) {
                    setRecentWorks(prev => [pendingWork, ...prev]);
                  }
                  const name = pendingWork.name;
                  setPendingWork(null);
                  setQuery('');
                  haptic.success();
                  setToast(`「${name}」に参加しました`);
                  setTimeout(() => setToast(null), 2500);
                }}
                className="w-full py-3 rounded-[14px] text-sm font-semibold active:opacity-70"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
              >
                「{pendingWork.name}」に参加する
              </button>
            </div>
          </div>
        </>
      )}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-full text-sm font-medium shadow-lg"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* 地域フィルターパネル */}
      {showRegionPanel && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRegionPanel(false)} />
          <div
            className="relative bg-bg-primary rounded-t-[18px]"
            style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
          >
            <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-separator">
              <div className="flex justify-center mb-2">
                <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-label-primary font-semibold text-sm">地域で絞り込む</p>
                <button onClick={() => setShowRegionPanel(false)} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
              </div>
              {filterActive && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs rounded-full px-2.5 py-0.5 border" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>{filterLabel}</span>
                  <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }} className="text-xs text-label-tertiary underline active:opacity-60">解除</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '16px 16px 40px' } as React.CSSProperties}>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">都道府県で選ぶ</p>
                <PrefectureSearch
                  value={filterMode === 'pref' ? filterValue ?? '' : ''}
                  onChange={pref => {
                    if (pref) { setFilterMode('pref'); setFilterValue(pref); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'pref', filterValue: pref, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                />
              </div>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
                <select
                  value={filterMode === 'region' ? filterValue ?? '' : ''}
                  onChange={e => {
                    if (e.target.value) { setFilterMode('region'); setFilterValue(e.target.value); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'region', filterValue: e.target.value, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                  className="w-full bg-bg-secondary rounded-[14px] px-3 py-3 text-sm text-label-primary outline-none border border-subtle appearance-none"
                >
                  <option value="">地域を選ぶ</option>
                  {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}地方</option>)}
                </select>
              </div>
              {filterMode === 'pref' && filterValue && (ADJACENT[filterValue]?.length ?? 0) > 0 && (
                <button
                  onClick={() => { setIncludeAdjacent(v => !v); saveRegionFilter({ filterMode, filterValue, includeAdjacent: !includeAdjacent }); }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-[14px] mb-5"
                >
                  <div>
                    <p className="text-sm text-label-primary text-left">隣接する県を含む</p>
                    {includeAdjacent && <p className="text-[10px] text-label-tertiary text-left mt-0.5">{ADJACENT[filterValue].join('・')}</p>}
                  </div>
                  <div className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ml-3" style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}>
                    <div className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm" style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }} />
                  </div>
                </button>
              )}
              {!homePref && (
                <div className="mb-4 px-4 py-3 bg-bg-secondary rounded-[14px] border border-faint">
                  <p className="text-label-primary text-sm font-medium mb-1">ホーム県を設定する</p>
                  <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくと、ワンタップでホーム県に絞り込めます。</p>
                  <button onClick={() => { setShowRegionPanel(false); navigate('/profile'); }} className="text-xs font-semibold active:opacity-60" style={{ color: 'var(--accent-color)' }}>プロフィールで登録する →</button>
                </div>
              )}
              {homePref && !(filterMode === 'pref' && filterValue === homePref) && (
                <button
                  onClick={() => {
                    setFilterMode('pref'); setFilterValue(homePref); setIncludeAdjacent(false);
                    saveRegionFilter({ filterMode: 'pref', filterValue: homePref, includeAdjacent: false });
                    setShowRegionPanel(false);
                  }}
                  className="w-full text-center py-3 rounded-[14px] text-sm font-medium active:opacity-70 mb-3"
                  style={{ background: 'var(--accent-color)', color: 'var(--accent-on)' }}
                >
                  ホーム県（{homePref}）で絞り込む
                </button>
              )}
              {filterActive && (
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); setShowRegionPanel(false); }} className="w-full text-center py-3 rounded-[14px] border border-subtle text-sm text-label-secondary active:opacity-60">全国表示（絞り込みなし）</button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
