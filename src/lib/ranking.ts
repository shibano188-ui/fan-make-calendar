import { supabase } from './supabase';
import { ANON_NAME } from './constants';

// ランキングとヌシの読み取り。書き込みは一切しない（集計はCronのSQL側）。
//
// スコアの係数（投稿×3 + いいね×1）は **SQL の生成列 1箇所**にある。
// ここで計算し直さないこと。2箇所に置くと必ずずれる。
// → sql/2026-09-01-nushi-ranking.sql

/** ランキングに出す1行 */
export type RankRow = {
  rank: number;
  userId: string;
  name: string;
  posts: number;
  likes: number;
  score: number;
  /** 表示名を設定していない人。自分の行なら「名前を設定」を促す */
  anonymous: boolean;
};

export type WorkNushi = {
  workId: string;
  workName?: string;
  userId: string;
  name: string;
  lastMonth: string;
};

/** ヌシの席の数と、席に着くのに要るスコア。SQL側の既定値と揃えてある
 *  （表示用。判定そのものは finalize_nushi の引数で決まる）。 */
export const NUSHI_SEATS = 3;
export const NUSHI_MIN_SCORE = 15;

/** 投稿1件ぶんの点数。「あと何件で3位」を出すのに使う（SQLの係数と同じ値） */
export const POINTS_PER_POST = 3;

/** 日本時間の「今月」（YYYY-MM-01）。月の境界はサーバー側もJSTで切っている。 */
export function currentMonth(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${jst.toISOString().slice(0, 7)}-01`;
}

/** 今月の残り日数。「残り9日」の表示に使う。 */
export function daysLeftInMonth(): number {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return last - jst.getUTCDate();
}

/** 表示名を設定していない人の呼び名。番号は人に固定されている（anon_numbers）。
 *  番号が無い＝まだ一度もランキングに載っていない人なので、素の ANON_NAME に落とす。 */
function anonLabel(n: number | null | undefined): string {
  return n == null ? ANON_NAME : `${ANON_NAME}(${n})`;
}

/** user_id の集合について表示名を解決する。設定していれば表示名、していなければ 名無しさん(n)。 */
async function resolveNames(userIds: string[]): Promise<Map<string, { name: string; anonymous: boolean }>> {
  const out = new Map<string, { name: string; anonymous: boolean }>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return out;

  const [settings, anon] = await Promise.all([
    supabase.from('user_settings').select('user_id, display_name').in('user_id', ids),
    supabase.from('anon_numbers').select('user_id, n').in('user_id', ids),
  ]);

  const nameMap = new Map<string, string>();
  for (const r of settings.data ?? []) {
    const dn = (r.display_name as string | null)?.trim();
    if (dn) nameMap.set(r.user_id as string, dn);
  }
  const numMap = new Map<string, number>();
  for (const r of anon.data ?? []) numMap.set(r.user_id as string, r.n as number);

  for (const id of ids) {
    const dn = nameMap.get(id);
    out.set(id, dn ? { name: dn, anonymous: false } : { name: anonLabel(numMap.get(id)), anonymous: true });
  }
  return out;
}

/** 順位を振る。同点は SQL 側で reached_at の早い順に並んでいるので、そのまま連番でよい
 *  （同点でも順位を分ける＝先に到達したほうが上、という仕様）。 */
function withRanks(
  rows: { user_id: string; posts: number; likes: number; score: number }[],
  names: Map<string, { name: string; anonymous: boolean }>,
): RankRow[] {
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: names.get(r.user_id)?.name ?? ANON_NAME,
    posts: r.posts,
    likes: r.likes,
    score: r.score,
    anonymous: names.get(r.user_id)?.anonymous ?? true,
  }));
}

export type RankingResult = {
  rows: RankRow[];
  /** 自分の行。上位に入っていなければ rows には含まれない */
  me: RankRow | null;
  /** その月・その範囲に載っている人数（順位の母数） */
  total: number;
};

/**
 * ランキングを引く。workId を渡せばその作品、渡さなければ総合（全作品合算）。
 *
 * 自分が上位圏外でも順位が要るので、母数と自分の位置は別に数える。
 * PostgREST は group by ができないので、総合は month_scores_total ビューを読む。
 */
export async function listRanking(opts: {
  month?: string;
  workId?: string;
  userId?: string | null;
  limit?: number;
}): Promise<RankingResult> {
  const month = opts.month ?? currentMonth();
  const limit = opts.limit ?? 20;

  // 作品ごとは元テーブル、総合は合算ビュー。列は同じなので読み口は共通にできる。
  // select は毎回ここで組む（PostgREST のビルダーは select を二度呼べない）。
  const table = opts.workId ? 'work_month_scores' : 'month_scores_total';
  const base = (countOnly = false) => {
    const q = countOnly
      ? supabase.from(table).select('user_id', { count: 'exact', head: true })
      : supabase.from(table).select('user_id, posts, likes, score');
    const filtered = q.eq('month', month);
    return opts.workId ? filtered.eq('work_id', opts.workId) : filtered;
  };

  const [topRes, countRes] = await Promise.all([
    base().order('score', { ascending: false }).order('reached_at', { ascending: true }).limit(limit),
    base(true),
  ]);

  const top = (topRes.data ?? []) as { user_id: string; posts: number; likes: number; score: number }[];
  const total = countRes.count ?? top.length;

  const ids = top.map((r) => r.user_id);
  if (opts.userId && !ids.includes(opts.userId)) ids.push(opts.userId);
  const names = await resolveNames(ids);

  const rows = withRanks(top, names);

  let me: RankRow | null = opts.userId ? (rows.find((r) => r.userId === opts.userId) ?? null) : null;

  // 圏外なら自分の行だけ引き直し、自分より上の人数を数えて順位にする
  if (opts.userId && !me) {
    const mineRes = await base().eq('user_id', opts.userId).maybeSingle();
    const mine = mineRes.data as { user_id: string; posts: number; likes: number; score: number } | null;
    if (mine) {
      const { count } = await base(true).gt('score', mine.score);
      me = {
        rank: (count ?? 0) + 1,
        userId: mine.user_id,
        name: names.get(mine.user_id)?.name ?? ANON_NAME,
        posts: mine.posts,
        likes: mine.likes,
        score: mine.score,
        anonymous: names.get(mine.user_id)?.anonymous ?? true,
      };
    }
  }

  return { rows, me, total };
}

/** 総合の自分の順位だけ。マイページのボタンに出す用（一覧は要らない）。 */
export async function getMyTotalRank(userId: string): Promise<{ rank: number; score: number; total: number } | null> {
  const month = currentMonth();
  const mineRes = await supabase
    .from('month_scores_total')
    .select('score')
    .eq('month', month)
    .eq('user_id', userId)
    .maybeSingle();
  const mine = mineRes.data as { score: number } | null;

  const totalRes = await supabase
    .from('month_scores_total')
    .select('user_id', { count: 'exact', head: true })
    .eq('month', month);
  const total = totalRes.count ?? 0;

  if (!mine) return total > 0 ? { rank: 0, score: 0, total } : null;

  const { count } = await supabase
    .from('month_scores_total')
    .select('user_id', { count: 'exact', head: true })
    .eq('month', month)
    .gt('score', mine.score);

  return { rank: (count ?? 0) + 1, score: mine.score, total };
}

/** その人が今ヌシをしている作品。マイページのバッジに使う。 */
export async function listMyNushi(userId: string): Promise<WorkNushi[]> {
  const { data } = await supabase
    .from('work_nushi_current')
    .select('work_id, user_id, last_month')
    .eq('user_id', userId);

  const rows = (data ?? []) as { work_id: string; user_id: string; last_month: string }[];
  if (rows.length === 0) return [];

  const { data: works } = await supabase
    .from('works')
    .select('id, name')
    .in('id', rows.map((r) => r.work_id));
  const workMap = new Map((works ?? []).map((w) => [w.id as string, w.name as string]));

  return rows.map((r) => ({
    workId: r.work_id,
    workName: workMap.get(r.work_id),
    userId: r.user_id,
    name: '',
    lastMonth: r.last_month,
  }));
}

/** その作品の今のヌシ（最大3人＋猶予中）。作品ごとのタブの見出しに出す。 */
export async function listWorkNushi(workId: string): Promise<WorkNushi[]> {
  const { data } = await supabase
    .from('work_nushi_current')
    .select('work_id, user_id, last_month, best_rank')
    .eq('work_id', workId)
    .order('best_rank', { ascending: true });

  const rows = (data ?? []) as { work_id: string; user_id: string; last_month: string }[];
  if (rows.length === 0) return [];

  const names = await resolveNames(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    workId: r.work_id,
    userId: r.user_id,
    name: names.get(r.user_id)?.name ?? ANON_NAME,
    lastMonth: r.last_month,
  }));
}

/** 「あと◯件でヌシ」。席の最下位との差を投稿数に直す。
 *  席が空いていれば閾値との差を返す（＝誰でも今から取れる）。 */
export function postsToSeat(myScore: number, seatScores: number[]): number {
  const target = seatScores.length >= NUSHI_SEATS
    ? Math.max(seatScores[NUSHI_SEATS - 1], NUSHI_MIN_SCORE)
    : NUSHI_MIN_SCORE;
  if (myScore >= target) return 0;
  return Math.ceil((target - myScore + 1) / POINTS_PER_POST);
}

/** バッジに出す作品名。長いと1行に収まらないので全角10文字で切る。 */
export function shortWorkName(name: string | undefined, max = 10): string {
  const n = name ?? '作品';
  return n.length > max ? `${n.slice(0, max)}…` : n;
}

/** マイページのバッジは6個まで。超えたぶんは「他◯件」に畳む。 */
export const NUSHI_BADGE_LIMIT = 6;
