import { ONBOARDING_KEY } from './constants';

// アプリの中のアンケート（2026-10-31 柴野）。回答は feedbacks に page='survey:<SURVEY_ID>' で入り、ダッシュボードで読める。
// 使い始めて3日たった人に1回出す。答えなければ14日おきに、合わせて3回まで。答えたらもう出さない。
// 覚えるのは端末だけ（入れ直すともう一度出るだけ）。次のアンケートは SURVEY_ID を変える。

export const SURVEY_ID = '2026-11';

const KEY = `fan_survey_${SURVEY_ID}`;
const DAY_MS = 86_400_000;
const FIRST_WAIT_DAYS = 3;
const RETRY_DAYS = 14;
const MAX_SHOWS = 3;

type State = { shown: number; lastAt: number; answered: boolean };

// 同じ起動で評価のカードと重ねないため（lib/review.ts）
let shownThisLaunch = false;
export const surveyShownThisLaunch = (): boolean => shownThisLaunch;

function load(): State {
  try { return { shown: 0, lastAt: 0, answered: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State> }; }
  catch { return { shown: 0, lastAt: 0, answered: false }; }
}

function save(s: State): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 次の起動でもう一度出るだけ */ }
}

/** 今回の起動でアンケートの案内を出すか。createdAt はアカウントを作った日時 */
export function shouldAskSurvey(createdAt: string, now = Date.now()): boolean {
  // 端末に覚えられないときは出さない（毎回出てしまう）
  try { if (!localStorage.getItem(ONBOARDING_KEY)) return false; } catch { return false; }
  const s = load();
  if (s.answered || s.shown >= MAX_SHOWS) return false;
  if (now - Date.parse(createdAt) < FIRST_WAIT_DAYS * DAY_MS) return false;
  return now - s.lastAt >= RETRY_DAYS * DAY_MS;
}

export function markSurveyShown(now = Date.now()): void {
  shownThisLaunch = true;
  const s = load();
  save({ ...s, shown: s.shown + 1, lastAt: now });
}

export function markSurveyAnswered(): void {
  save({ ...load(), answered: true });
}
