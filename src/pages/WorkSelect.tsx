import { useState, useEffect, useRef } from 'react';
import {} from 'react-router-dom';
import { Search, ChevronRight, MoreVertical, LogOut, Trash2, Check } from 'lucide-react';
import Layout from '../components/Layout';
import SettingsMenuButton from '../components/SettingsMenuButton';
import { listWorks, searchWorks, getOrCreateWork, getWorkById, upsertParticipation, listRecentWorks, leaveCalendar, deleteWork } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Work } from '../lib/api';
import { POST_CATEGORIES, loadCategoryFilters, saveCategoryFilters } from '../lib/constants';

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
      className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-secondary rounded-xl text-left transition-opacity disabled:opacity-100"
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
      <div className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-secondary rounded-xl">
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
              <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-subtle rounded-xl overflow-hidden shadow-lg w-48">
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

  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [popularWorks, setPopularWorks] = useState<Work[]>([]);
  const [recentWorks, setRecentWorks] = useState<Work[]>([]);
  const [searchResults, setSearchResults] = useState<Work[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [error, setError] = useState('');
  const [pendingWork, setPendingWork] = useState<Work | null>(null);
  const [pendingCats, setPendingCats] = useState<string[]>([]);

  useEffect(() => {
    listWorks()
      .then(setPopularWorks)
      .catch(() => setError('作品の読み込みに失敗しました'))
      .finally(() => setLoadingPopular(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    listRecentWorks(user.id).then(setRecentWorks).catch(console.error);
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
    if (!window.confirm(`「${work.name}」から抜けますか？`)) return;
    try {
      await leaveCalendar(work.id, user.id);
      setRecentWorks(prev => prev.filter(w => w.id !== work.id));
    } catch {
      setError('操作に失敗しました');
    }
  };

  const handleDelete = async (work: Work) => {
    if (!user) return;
    if (!window.confirm(`「${work.name}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
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
          <div className="mt-1"><SettingsMenuButton /></div>
        </div>
      </div>

      <div className="px-5 mb-6">
        <div className="flex items-center gap-3 bg-bg-secondary rounded-xl px-4 py-3">
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
                  className="w-full flex items-center justify-between px-4 py-3.5 bg-bg-secondary rounded-xl text-left active:opacity-70 transition-opacity"
                >
                  <div>
                    <p className="text-label-primary font-semibold text-[15px]">「{q}」を新しく作る</p>
                    <p className="text-label-secondary text-xs mt-0.5">このカレンダーを最初に作成する</p>
                  </div>
                  <ChevronRight size={16} className="text-label-tertiary flex-shrink-0 ml-2" />
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
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-xl animate-pulse" />)}
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
          <div className="fixed bottom-0 left-0 right-0 z-[160] max-w-app mx-auto rounded-t-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
                      className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                      style={active ? {
                        borderColor: 'var(--accent-color)',
                        color: 'var(--accent-color)',
                        backgroundColor: 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
                      } : {
                        borderColor: 'var(--border-default)',
                        color: 'var(--label-secondary)',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPendingCats([...POST_CATEGORIES])}
                  className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                  style={{
                    borderColor: 'var(--border-default)',
                    color: 'var(--label-tertiary)',
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
                  // pendingCats = 表示したいカテゴリ → excludeCats = 非表示にするカテゴリ
                  const excludeCats = pendingCats.length === POST_CATEGORIES.length
                    ? []  // 全選択 = 除外なし
                    : POST_CATEGORIES.filter(c => !pendingCats.includes(c));
                  const updated = { ...loadCategoryFilters(), [pendingWork.id]: excludeCats };
                  saveCategoryFilters(updated);
                  // 参加済みリストを即時更新（チェックマークを即座に反映）
                  if (!recentWorks.some(w => w.id === pendingWork.id)) {
                    setRecentWorks(prev => [pendingWork, ...prev]);
                  }
                  setPendingWork(null);
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold active:opacity-70"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--bg-primary)' }}
              >
                「{pendingWork.name}」に参加する
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
