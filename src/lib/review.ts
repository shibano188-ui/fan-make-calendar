import { Capacitor } from '@capacitor/core';
import { AppReview } from '@capawesome/capacitor-app-review';
import { supabase } from './supabase';
import { ONBOARDING_KEY } from './constants';
import { surveyShownThisLaunch } from './survey';

// ストアの評価をお願いする（2026-10-31 柴野）。星のカードは OS のもので、出すかどうかも OS が決める。
// 自前の「評価をお願いします」は出さない。Google は表示の前に質問することを認めておらず、
// ボタンから呼ぶことも勧めていない（回数の上限で何も出ないことがある）。良い場面で黙って呼ぶ。
// 良い場面 = ♡が5件たまった・通知から予定を開いた。使い始めて7日たった人だけ、120日に1回まで。

const KEY = 'fan_review_v1';
const DAY_MS = 86_400_000;
const MIN_ACCOUNT_DAYS = 7;
const RETRY_DAYS = 120;
const LIKES_NEEDED = 5;
// 操作の直後や画面の切り替えの途中に重ならないよう、少し待つ
const DELAY_MS = 2000;

type State = { likes: number; askedAt: number };

function load(): State {
  try { return { likes: 0, askedAt: 0, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State> }; }
  catch { return { likes: 0, askedAt: 0 }; }
}

function save(s: State): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 覚えられなければ次の機会にもう一度呼ぶだけ */ }
}

async function canAsk(now: number): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('AppReview')) return false;
  try { if (!localStorage.getItem(ONBOARDING_KEY)) return false; } catch { return false; }
  if (surveyShownThisLaunch() || now - load().askedAt < RETRY_DAYS * DAY_MS) return false;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  const { data } = await supabase.auth.getSession();
  const createdAt = data.session?.user.created_at;
  return !!createdAt && now - Date.parse(createdAt) >= MIN_ACCOUNT_DAYS * DAY_MS;
}

/** 良い場面で呼ぶ。条件に合わなければ何もしない */
export function askReviewLater(): void {
  setTimeout(() => {
    const now = Date.now();
    void canAsk(now).then((ok) => {
      if (!ok) return;
      save({ ...load(), askedAt: now });
      return AppReview.requestReview();
    }).catch(() => { /* 出なくても困らない */ });
  }, DELAY_MS);
}

/** ♡を押したときに呼ぶ */
export function noteLikeForReview(): void {
  const s = load();
  save({ ...s, likes: s.likes + 1 });
  if (s.likes + 1 >= LIKES_NEEDED) askReviewLater();
}
