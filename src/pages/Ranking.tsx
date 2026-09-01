import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown } from 'lucide-react';
import { listAllParticipatedWorks, type Work } from '../lib/api';
import {
  listRanking, listWorkNushi, currentMonth, daysLeftInMonth, postsToSeat,
  NUSHI_SEATS, NUSHI_MIN_SCORE, POINTS_PER_POST,
  type RankRow, type RankingResult, type WorkNushi,
} from '../lib/ranking';
import { getCached, setCached } from '../lib/swrCache';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';

// 今月のランキング。総合（全作品合算）と、フォロー中の作品ごとをタブで切り替える。
//
// 席が空いている状態を「空っぽ」ではなく「今なら取れる」として見せるのが**この画面の要**。
// 人が集まる前に出す機能なので、大半の人が最初に見るのは埋まっていない画面になる。
// 順位が並ぶより「あと◯件で初代のヌシ」のほうが、次の投稿に近い。

const TOTAL = '__total__';

export default function Ranking() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [works, setWorks] = useState<Work[]>(() => getCached<Work[]>('follows:ranking') ?? []);
  const [tab, setTab] = useState<string>(params.get('work') ?? TOTAL);
  const [data, setData] = useState<RankingResult | null>(null);
  const [nushi, setNushi] = useState<WorkNushi[]>([]);
  const [loading, setLoading] = useState(true);

  const month = currentMonth();
  const daysLeft = daysLeftInMonth();

  useEffect(() => {
    if (!user) return;
    listAllParticipatedWorks(user.id)
      .then((ws) => { setWorks(ws); setCached('follows:ranking', ws); })
      .catch(() => { /* タブが総合だけになるが画面は成立する */ });
  }, [user]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const workId = tab === TOTAL ? undefined : tab;
    Promise.all([
      listRanking({ month, workId, userId: user?.id ?? null }),
      workId ? listWorkNushi(workId) : Promise.resolve([]),
    ])
      .then(([r, n]) => { if (alive) { setData(r); setNushi(n); } })
      .catch(() => { if (alive) { setData({ rows: [], me: null, total: 0 }); setNushi([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, month, user]);

  const selectTab = (t: string) => {
    haptic.select();
    setTab(t);
    if (t === TOTAL) { params.delete('work'); } else { params.set('work', t); }
    setParams(params, { replace: true });
  };

  // 席に着くのに必要な投稿数。席が埋まっていれば最下位との差、空いていれば閾値まで。
  const seatScores = useMemo(() => (data?.rows ?? []).slice(0, NUSHI_SEATS).map((r) => r.score), [data]);
  const need = postsToSeat(data?.me?.score ?? 0, seatScores);
  const seatsOpen = NUSHI_SEATS - nushi.length;

  const workName = tab === TOTAL ? null : (works.find((w) => w.id === tab)?.name ?? '作品');

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold flex-1">ランキング</span>
          <span className="text-[11px] text-label-tertiary pr-2">残り{daysLeft}日</span>
        </div>

        {/* タブ。総合が既定で、その横にフォロー中の作品が並ぶ */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2">
          <TabChip label="総合" active={tab === TOTAL} onClick={() => selectTab(TOTAL)} />
          {works.map((w) => (
            <TabChip key={w.id} label={w.name} active={tab === w.id} onClick={() => selectTab(w.id)} />
          ))}
        </div>

        <div className="px-3 pb-8">
          {/* 作品タブでは今のヌシを先に出す。誰が席に着いているかが主役 */}
          {tab !== TOTAL && !loading && (
            <div className="mb-3 px-3 py-2.5 rounded-2xl" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold mb-1">
                <Crown size={13} strokeWidth={2.5} style={{ color: 'var(--accent-color)' }} />
                {workName}のヌシ
              </div>
              {nushi.length === 0 ? (
                <div className="text-[12px] text-label-secondary">
                  まだ誰もいません。席は{NUSHI_SEATS}つとも空いています
                </div>
              ) : (
                <div className="text-[13px]">
                  {nushi.map((n) => n.name).join('・')}
                  {seatsOpen > 0 && (
                    <span className="text-[12px] text-label-secondary">（あと{seatsOpen}席）</span>
                  )}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center text-[13px] text-label-tertiary py-16">読み込み中…</div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              scope={tab === TOTAL ? '総合' : (workName ?? '')}
              isWork={tab !== TOTAL}
              onPost={() => { haptic.select(); navigate('/post'); }}
            />
          ) : (
            <>
              <div className="flex flex-col">
                {data!.rows.map((r) => (
                  <Row key={r.userId} row={r} me={r.userId === user?.id}
                    onSetName={() => { haptic.select(); navigate('/mypage'); }} />
                ))}
              </div>

              {/* 圏外なら自分の行を下に切り離して出す。自分が今どこにいるかが見えないと動機にならない */}
              {data!.me && !data!.rows.some((r) => r.userId === user?.id) && (
                <>
                  <div className="text-center text-[11px] text-label-tertiary py-1.5">…</div>
                  <Row row={data!.me} me
                    onSetName={() => { haptic.select(); navigate('/mypage'); }} />
                </>
              )}

              {/* 席までの距離。ここが「もう1件投稿する」に一番近い一言 */}
              {user && need > 0 && (
                <div className="mt-4 px-3 py-3 rounded-2xl text-center" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <div className="text-[13px] font-semibold">
                    あと{need}件の投稿で
                    {tab === TOTAL ? `${NUSHI_SEATS}位` : `${workName}のヌシ`}
                  </div>
                  <div className="text-[11px] text-label-secondary mt-0.5">残り{daysLeft}日</div>
                  <button onClick={() => { haptic.select(); navigate('/post'); }}
                    className="pressable mt-2.5 px-5 py-2 rounded-full text-[13px] font-semibold"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                    投稿する
                  </button>
                </div>
              )}

              <div className="mt-4 text-[11px] text-label-tertiary leading-relaxed">
                スコア = 投稿 × {POINTS_PER_POST} ＋ もらったいいね × 1。
                毎月1日にその月の順位が確定し、上位{NUSHI_SEATS}名がその作品のヌシになります
                （{NUSHI_MIN_SCORE}点以上）。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="pressable flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap"
      style={active
        ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
        : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
      {label}
    </button>
  );
}

function Row({ row, me, onSetName }: { row: RankRow; me: boolean; onSetName: () => void }) {
  const medal = row.rank <= NUSHI_SEATS;
  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-subtle"
      style={me ? { backgroundColor: 'var(--fill-quaternary)' } : undefined}>
      <span className="w-7 text-center text-[15px] font-bold flex-shrink-0"
        style={medal ? { color: 'var(--accent-color)' } : { color: 'var(--label-tertiary)' }}>
        {row.rank}
      </span>
      {medal && <Crown size={14} strokeWidth={2.5} className="flex-shrink-0" style={{ color: 'var(--accent-color)' }} />}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">
          {row.name}{me && <span className="text-[11px] text-label-tertiary font-normal">（自分）</span>}
        </div>
        <div className="text-[11px] text-label-tertiary">投稿{row.posts}・いいね{row.likes}</div>
      </div>
      {/* 名前の設定を促すのは自分の行だけ。他人の匿名を指して出すものではない */}
      {me && row.anonymous && (
        <button onClick={onSetName}
          className="pressable flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' }}>
          名前を設定
        </button>
      )}
      <span className="text-[15px] font-bold tabular-nums flex-shrink-0">{row.score}</span>
    </div>
  );
}

/** 誰も載っていないとき。**この画面で一番大事な状態**。
 *  「まだ誰もいません」で終わらせず、席が空いていることを誘いに変える。 */
function EmptyState({ scope, isWork, onPost }: { scope: string; isWork: boolean; onPost: () => void }) {
  const posts = Math.ceil(NUSHI_MIN_SCORE / POINTS_PER_POST);
  return (
    <div className="text-center py-14 px-4">
      <Crown size={30} strokeWidth={2} className="mx-auto mb-3" style={{ color: 'var(--accent-color)' }} />
      <div className="text-[15px] font-bold">
        {isWork ? `${scope}のヌシの席が空いています` : '今月はまだ誰も投稿していません'}
      </div>
      <div className="text-[13px] text-label-secondary mt-2 leading-relaxed">
        今月{posts}件投稿すれば、<br />あなたが初代のヌシになれます
      </div>
      <button onClick={onPost}
        className="pressable mt-4 px-5 py-2.5 rounded-full text-[14px] font-semibold"
        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
        投稿する
      </button>
    </div>
  );
}
