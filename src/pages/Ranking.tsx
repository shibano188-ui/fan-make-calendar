import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Crown } from 'lucide-react';
import { listAllParticipatedWorks, type Work } from '../lib/api';
import {
  listRanking, listWorkNushi, currentMonth, daysLeftInMonth, postsToSeat,
  NUSHI_SEATS, NUSHI_MIN_SCORE, POINTS_PER_POST,
  type RankRow, type RankingResult, type WorkNushi,
} from '../lib/ranking';
import UserProfileModal from '../components/UserProfileModal';
import { getCached, setCached } from '../lib/swrCache';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';

// 今月のランキング。総合（全作品合算）と、フォロー中の作品ごとをタブで切り替える。
//
// 席が空いている状態を「空っぽ」ではなく「今なら取れる」として見せるのが**この画面の要**。
// 人が集まる前に出す機能なので、大半の人が最初に見るのは埋まっていない画面になる。
// 順位が並ぶより「あと◯件で初代のヌシ」のほうが、次の投稿に近い。

const TOTAL = '__total__';

/** 一覧の1行。実在する順位の行か、埋まっていないヌシの席か。 */
type ListItem =
  | { kind: 'row'; row: RankRow }
  | { kind: 'seat'; rank: number; need: number };

export default function Ranking() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [works, setWorks] = useState<Work[]>(() => getCached<Work[]>('follows:ranking') ?? []);
  const [tab, setTab] = useState<string>(params.get('work') ?? TOTAL);
  const [data, setData] = useState<RankingResult | null>(null);
  const [nushi, setNushi] = useState<WorkNushi[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const month = currentMonth();
  const daysLeft = daysLeftInMonth();

  // 開いたら最上部から表示する（前のページのスクロール位置を引き継がない）。
  // マイページのランキングボタンは下のほうにあるので、これが無いと
  // 開いた瞬間に一覧の途中が見えている状態になる。
  // 読み込み中は中身が短くて効かないので、データが入った(loading)あとにも実行する。
  useEffect(() => {
    const reset = () => {
      let el = rootRef.current?.parentElement as HTMLElement | null;
      while (el) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    };
    reset();
    requestAnimationFrame(reset);
  }, [loading]);

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

  const seatsOpen = NUSHI_SEATS - nushi.length;
  const outOfTop = !!data?.me && !data.rows.some((r) => r.userId === user?.id);

  // 一覧の中身。作品タブは**1位から3位までが必ず並ぶ**ようにし、
  // まだ誰もいない順位は空席として出す。
  //
  // 席＝上位3つの順位。ただし**そこに居れば自動でヌシではない**（15点以上が要る）ので、
  // 点が足りない人には王冠を出さない。人数が3人未満のときだけ空席の行を足す
  // （実在の順位と番号がぶつからないよう、足すのは必ず末尾）。
  const rows = useMemo<ListItem[]>(() => {
    const list = data?.rows ?? [];
    const items: ListItem[] = list.map((row) => ({ kind: 'row' as const, row }));
    if (tab === TOTAL) return items;

    const myScore = data?.me?.score ?? 0;
    const seatScores = list.slice(0, NUSHI_SEATS).map((r) => r.score);
    for (let rank = list.length + 1; rank <= NUSHI_SEATS; rank++) {
      items.push({ kind: 'seat', rank, need: postsToSeat(myScore, seatScores) });
    }
    return items;
  }, [data, tab]);

  const workName = tab === TOTAL ? null : (works.find((w) => w.id === tab)?.name ?? '作品');

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
                今の{workName}のヌシ
              </div>
              {nushi.length === 0 ? (
                <div className="text-[12px] text-label-secondary">まだ決まっていません</div>
              ) : (
                <div className="text-[13px]">
                  {nushi.map((n, i) => (
                    <span key={n.userId}>
                      {i > 0 && <span className="text-label-tertiary">・</span>}
                      <button onClick={() => { haptic.select(); setViewingUserId(n.userId); }}
                        className="pressable font-semibold" style={{ color: 'var(--accent-text)' }}>
                        {n.name}
                      </button>
                    </span>
                  ))}
                  {seatsOpen > 0 && (
                    <span className="text-[12px] text-label-secondary">（あと{seatsOpen}枠）</span>
                  )}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center text-[13px] text-label-tertiary py-16">読み込み中…</div>
          ) : (
            <>
              {/* 作品タブは**席が並んでいる**形にする。「あと2件」と文章で書くより、
                  空席が1位2位3位として並んでいるほうが「取れる」が一目で伝わる。
                  総合には席（ヌシ）が無いので、ここは順位を並べるだけ。

                  上の見出しは**先月までに確定したヌシ**、この一覧は**今月の途中経過**。
                  別のものなので、ラベルを分けないと「ヌシがいるのに空席」に見える。 */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold text-label-secondary">今月の順位</span>
                <span className="text-[11px] text-label-tertiary">残り{daysLeft}日</span>
              </div>
              <div className="flex flex-col">
                {rows.map((r) =>
                  r.kind === 'row'
                    ? <Row key={r.row.userId} row={r.row} isWork={tab !== TOTAL} me={r.row.userId === user?.id}
                        onSetName={() => { haptic.select(); navigate('/mypage'); }}
                        onOpenUser={() => { haptic.select(); setViewingUserId(r.row.userId); }} />
                    : <EmptySeat key={`seat-${r.rank}`} rank={r.rank} need={r.need}
                        onPost={() => { haptic.select(); navigate('/post'); }} />,
                )}
              </div>

              {/* 圏外なら自分の行を下に切り離して出す。今どこにいるかが見えないと動機にならない */}
              {outOfTop && data!.me && (
                <>
                  <div className="text-center text-[11px] text-label-tertiary py-1.5">…</div>
                  <Row row={data!.me} isWork={tab !== TOTAL} me
                    onSetName={() => { haptic.select(); navigate('/mypage'); }}
                    onOpenUser={() => { haptic.select(); setViewingUserId(data!.me!.userId); }} />
                </>
              )}

              <div className="mt-4 text-[11px] text-label-tertiary leading-relaxed">
                スコア = 投稿 × {POINTS_PER_POST} ＋ もらったいいね × 1。
                {tab !== TOTAL &&
                  `毎月1日に順位が確定し、上位${NUSHI_SEATS}名（${NUSHI_MIN_SCORE}点以上）がこの作品のヌシになります。`}
              </div>
            </>
          )}
        </div>
      </div>

      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          workId={tab === TOTAL ? undefined : tab}
          workName={workName ?? undefined}
          onClose={() => setViewingUserId(null)}
        />
      )}
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

/** ヌシの席として数えられるか。**順位だけでは足りない**（上位3名 かつ 15点以上）。 */
function isSeated(row: RankRow): boolean {
  return row.rank <= NUSHI_SEATS && row.score >= NUSHI_MIN_SCORE;
}

function Row({ row, isWork, me, onSetName, onOpenUser }: {
  row: RankRow; isWork: boolean; me: boolean; onSetName: () => void; onOpenUser: () => void;
}) {
  // 王冠は**作品タブだけ**。総合にヌシという席は無いので、出すと
  // 「総合のヌシが決まっていない」と読めてしまう。総合は順位の色分けだけにする。
  const seated = isWork && isSeated(row);
  const top3 = row.rank <= NUSHI_SEATS;
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-subtle"
      style={me ? { backgroundColor: 'var(--fill-quaternary)' } : undefined}>
      <span className="w-6 text-center text-[15px] font-bold flex-shrink-0"
        style={top3 ? { color: 'var(--accent-color)' } : { color: 'var(--label-tertiary)' }}>
        {row.rank}
      </span>
      <span className="w-4 flex-shrink-0">
        {seated && <Crown size={14} strokeWidth={2.5} style={{ color: 'var(--accent-color)' }} />}
      </span>
      <div className="flex-1 min-w-0">
        {/* 名前から投稿詳細と同じプロフィールパネルを開く。
            ランキングで見かけた人をその場で辿れないと、順位が数字で終わってしまう */}
        <button onClick={onOpenUser} className="pressable block max-w-full text-left">
          <span className="text-[14px] font-semibold truncate block">
            {row.name}{me && <span className="text-[11px] text-label-tertiary font-normal">（自分）</span>}
          </span>
        </button>
        <div className="text-[11px] text-label-tertiary">
          投稿{row.posts}・いいね{row.likes}
          {/* 上位3位に居ても点が足りなければ席は決まらない。あと何点かをここで言う */}
          {isWork && top3 && !seated && (
            <span style={{ color: 'var(--accent-text)' }}>
              ・あと{NUSHI_MIN_SCORE - row.score}点でヌシ
            </span>
          )}
        </div>
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

/** まだ誰も居ない順位。人が集まる前に出す機能なので、
 *  大半の人が最初に見るのはこの行が並んだ画面になる。
 *  空欄で終わらせず、あと何件でヌシになれるかだけを添える。 */
function EmptySeat({ rank, need, onPost }: { rank: number; need: number; onPost: () => void }) {
  return (
    <button onClick={onPost}
      className="w-full pressable flex items-center gap-2 py-2.5 border-b border-subtle text-left">
      <span className="w-6 text-center text-[15px] font-bold flex-shrink-0 text-label-tertiary">{rank}</span>
      <span className="w-4 flex-shrink-0">
        <Crown size={14} strokeWidth={2} style={{ color: 'var(--label-quaternary, var(--label-tertiary))', opacity: 0.4 }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-label-tertiary">—</div>
        <div className="text-[11px]" style={{ color: 'var(--accent-text)' }}>
          {need > 0 ? `あと${need}件でヌシになれます` : '投稿するとヌシになれます'}
        </div>
      </div>
      <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
    </button>
  );
}
