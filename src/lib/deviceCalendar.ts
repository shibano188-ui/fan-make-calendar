// 端末カレンダーへの直接書き込み（プレミアム・ネイティブのみ）。
//
// ics購読（api/ics.ts）はカレンダー側が取りに来るまで反映されず、Googleだと8〜24時間遅れる。
// こちらは端末のカレンダーに直接書くので、アプリが動いた時点で即反映される。
// 対象・予定の作り方は ics と完全に揃える（いいね＋自分の投稿／締切は別予定）。
//
// 書き込み先は「端末に既にあるカレンダー」から本人に選んでもらう。専用カレンダーを作る手もあるが、
// Androidで作れるのは ACCOUNT_TYPE_LOCAL のカレンダーだけで端末内に閉じてしまい、
// 「PCでも見たい」が満たせない（既存のGoogleカレンダーに書けば同期アダプタがサーバへ上げる）。
//
// ⚠️ Webでは動かない（プラグインはネイティブのみ）。PC専用の人のために ics 購読は残す。
import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import type { CalendarEvent } from '../types';
import { parseCategories } from './constants';
import { buildWorkColorMap } from './workColors';

const ENABLED_KEY = 'fan_device_cal_enabled';
const TARGET_KEY = 'fan_device_cal_id';
/** 予定キー → { 端末側のイベントID, 内容のハッシュ }。更新・削除に追随するための対応表。 */
const MAP_KEY = 'fan_device_cal_map';

export type DeviceCalendar = { id: string; title: string };
type Entry = { id: string; hash: string };
type Desired = {
  title: string;
  startDate: number;
  endDate: number;
  isAllDay: boolean;
  description: string;
  location: string;
  url: string;
  /** 作品ごとの色（アプリ内の作品カラーと同じもの）。Androidのみ効く。 */
  color?: string;
};

export function deviceCalendarSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function isDeviceCalendarOn(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

/** 書き込み先カレンダーID。端末ごとに違うのでサーバーには同期しない（デバイス間同期の対象外）。 */
export function getTargetCalendarId(): string | null {
  try { return localStorage.getItem(TARGET_KEY); } catch { return null; }
}

export function setTargetCalendarId(id: string | null): void {
  try { if (id) localStorage.setItem(TARGET_KEY, id); else localStorage.removeItem(TARGET_KEY); } catch { /* noop */ }
}

function loadMap(): Record<string, Entry> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') as Record<string, Entry>; } catch { return {}; }
}

function saveMap(m: Record<string, Entry>): void {
  try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/** 権限を取り、書き込み先の候補を返す。一覧を出すには読み取りも要るのでフルアクセスを求める。 */
export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  if (!deviceCalendarSupported()) return [];
  const { result } = await CapacitorCalendar.requestFullCalendarAccess();
  if (result !== 'granted') return [];
  const { result: cals } = await CapacitorCalendar.listCalendars();
  return cals.map((c) => ({ id: String(c.id), title: c.title }));
}

/** 端末の既定カレンダー（何も選ばなかった人のための初期値）。 */
export async function getDefaultDeviceCalendarId(): Promise<string | null> {
  if (!deviceCalendarSupported()) return null;
  try {
    const { result } = await CapacitorCalendar.getDefaultCalendar();
    return result?.id != null ? String(result.id) : null;
  } catch { return null; }
}

/** ONにする。権限が取れなければ false を返す（呼び出し側は ics 方式を案内する）。 */
export async function enableDeviceCalendar(): Promise<boolean> {
  if (!deviceCalendarSupported()) return false;
  const { result } = await CapacitorCalendar.requestFullCalendarAccess();
  if (result !== 'granted') return false;
  if (!getTargetCalendarId()) setTargetCalendarId(await getDefaultDeviceCalendarId());
  try { localStorage.setItem(ENABLED_KEY, '1'); } catch { /* noop */ }
  return true;
}

/** OFFにする。書き込んだ予定は残さず消す（自分が入れたものだけを対応表から辿って消す）。 */
export async function disableDeviceCalendar(): Promise<void> {
  try { localStorage.setItem(ENABLED_KEY, '0'); } catch { /* noop */ }
  const map = loadMap();
  const ids = Object.values(map).map((e) => e.id);
  if (ids.length && deviceCalendarSupported()) {
    try { await CapacitorCalendar.deleteEventsById({ ids }); } catch { /* 消せなくても設定は切る */ }
  }
  saveMap({});
}

/** 全日予定は UTC 0時で持つ（Androidの CalendarContract の約束事。端末TZの0時で入れると
 *  読み手によって前日にずれる）。日付は 'YYYY-MM-DD'。 */
function utcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 時刻ありは日本時間として解釈する（アプリはJSTのみ扱う）。 */
function jstTime(date: string, time: string): number {
  return new Date(`${date}T${time.slice(0, 5)}:00+09:00`).getTime();
}

const DAY = 86400000;

/** ics（api/ics.ts）と同じルールで「カレンダーに入れる予定」を組み立てる。
 *  キーは ics の UID と揃えてある（本体=イベントID、締切=`${id}-deadline`）。 */
export function buildDesired(events: CalendarEvent[]): Record<string, Desired> {
  const out: Record<string, Desired> = {};
  // カレンダーを開いた瞬間にどの作品か分かるよう、アプリ内の作品カラーをそのまま予定の色にする。
  // Googleカレンダー・Appleカレンダーに「タグ」の欄は無く、区別に使えるのは色だけ。
  // ※ 予定ごとの色はAndroidのみ（iOSのEventKitはカレンダー単位の色しか持たない）。
  //   割り当て済みの色だけを使う（ここで新規割り当てはしない＝アプリの見た目と食い違わせない）。
  const colors = buildWorkColorMap();
  for (const e of events) {
    const url = e.link || `https://fanhive.jp/item/${e.id}`;
    // アプリ内の予定へのリンク。**これが目印を兼ねる**（対応表が消えても、この行があるかどうかで
    // 「自分が入れた予定か」「どの予定か」が分かる → 入れ直しても重複しない。下の findExisting 参照）
    const marker = `https://fanhive.jp/item/${e.id}`;
    // ⚠️ url はiOS（EventKit）にしか入らない。AndroidのCalendarContractにURL列が無く、
    // プラグインも書いていないので、メモ欄に必ず本文としても入れる（カレンダーアプリが
    // リンクとして拾う）。作品名・カテゴリも「何の予定か」が分かるようここに載せる。
    const tags = [e.workName, ...parseCategories(e.category)].filter(Boolean).join(' / ');
    const desc = [e.memo, tags, url === marker ? '' : url, marker].filter(Boolean).join('\n\n');
    const location = [e.prefecture, e.locationDetail].filter(Boolean).join(' ');
    const color = e.workId ? colors.get(e.workId) : undefined;
    if (e.date) {
      // 曖昧日付（「7月上旬」など）は date が代表日でしかなく、期間・時刻は意味を持たない。
      // 代表日の全日予定にして、見た人が誤解しないようタイトルにラベルを添える。
      const vague = !!e.dateLabel;
      const title = vague ? `${e.title}（${e.dateLabel}）` : e.title;
      const time = vague ? undefined : e.time;
      const end = vague ? undefined : e.endDate;
      out[e.id] = time
        ? { title, startDate: jstTime(e.date, time), endDate: jstTime(end || e.date, time), isAllDay: false, description: desc, location, url, color }
        : { title, startDate: utcMidnight(e.date), endDate: utcMidnight(end || e.date) + DAY, isAllDay: true, description: desc, location, url, color };
    }
    // 受付の締切は見逃すと取り返しがつかないので、日付が別なら独立した予定として出す
    if (e.preorderEnd && e.preorderEnd !== e.date) {
      out[`${e.id}-deadline`] = {
        title: `【締切】${e.title}`,
        startDate: utcMidnight(e.preorderEnd),
        endDate: utcMidnight(e.preorderEnd) + DAY,
        isAllDay: true,
        // 本体と同じ内容なので、目印だけ `#deadline` で区別する（同じ予定の2件目だと分かるように）
        description: desc.replace(marker, `${marker}#deadline`),
        location,
        url,
        color,
      };
    }
  }
  return out;
}

function hashOf(d: Desired): string {
  return `${d.title}|${d.startDate}|${d.endDate}|${d.isAllDay ? 1 : 0}|${d.description}|${d.location}|${d.url}|${d.color ?? ''}`;
}

/** 書き込み権限があるか。
 *  ⚠️ checkAllPermissions の戻りは型定義（`{ result: { writeCalendar } }`）と Android の実装が
 *  食い違う。Androidは各スコープを**トップレベル**に入れ、`result` には Kotlin の Map を
 *  文字列化したもの（`"{WRITE_CALENDAR=granted, ...}"`）を入れてくる。型どおりに
 *  `result.writeCalendar` と読むと必ず undefined になり、同期が毎回黙って止まる。 */
async function canWriteCalendar(): Promise<boolean> {
  const res = (await CapacitorCalendar.checkAllPermissions()) as unknown as {
    writeCalendar?: string;
    result?: { writeCalendar?: string } | string;
  };
  const state = typeof res.result === 'object' ? res.result?.writeCalendar : res.writeCalendar;
  return state === 'granted';
}

/** 予定キーから、説明欄に入れている目印を復元する。 */
function markerFor(key: string): string {
  const suffix = '-deadline';
  return key.endsWith(suffix)
    ? `https://fanhive.jp/item/${key.slice(0, -suffix.length)}#deadline`
    : `https://fanhive.jp/item/${key}`;
}

/** 起動してから一度でもカレンダーの中身を見に行ったか（重複の掃除は1セッション1回でよい）。 */
let scannedThisSession = false;

function push(m: Map<string, string[]>, k: string, v: string): void {
  const cur = m.get(k);
  if (cur) cur.push(v); else m.set(k, [v]);
}

/** 対応表に無い予定を、書き込み先カレンダーの中から探して拾い直す。
 *
 *  対応表は localStorage にしか無いので、**アプリを入れ直すと消える**。一方カレンダー側の予定は
 *  （Googleアカウントのカレンダーなら）サーバーに残っているので、そのまま同期すると
 *  「まだ作っていない」と判断して全部作り直す＝同じ予定が二重・三重に増える。
 *  debug版とPlay版を同じカレンダーに向けたときも同じことが起きる。
 *
 *  そこで説明欄の末尾に入れているアプリ内リンクを目印にして、既にある予定を拾い直す。
 *  同じ目印が複数あれば過去の重複なので、1件だけ残して消す（＝入れ直しの後始末も兼ねる）。
 *  戻り値は対応表を書き換えたか。 */
async function adoptExisting(
  calendarId: string,
  desired: Record<string, Desired>,
  map: Record<string, Entry>,
): Promise<boolean> {
  const keys = Object.keys(desired);
  if (!keys.length) return false;
  // 対応表が欠けているとき（＝入れ直した直後）に加えて、アプリを開いてから1回は必ず見に行く。
  // 既に増えてしまった重複を片付けるため。いいねのたびに一覧を取りに行くのは重いので毎回はしない
  if (keys.every((k) => map[k]) && scannedThisSession) return false;

  const byMarker = new Map<string, string[]>();
  const byTitleStart = new Map<string, string[]>();
  const titleById = new Map<string, string>();
  try {
    const { result } = await CapacitorCalendar.listEventsInRange({
      from: Math.min(...keys.map((k) => desired[k].startDate)) - DAY,
      to: Math.max(...keys.map((k) => desired[k].endDate)) + DAY,
    });
    for (const ev of result) {
      // 選んだカレンダー以外には絶対に触らない
      if (String(ev.calendarId) !== calendarId) continue;
      const id = String(ev.id);
      titleById.set(id, ev.title);
      // 目印は完全一致で拾う（本体のリンクは締切のリンクの前方一致になるため、includes では混ざる）
      for (const token of (ev.description ?? '').split(/\s+/)) {
        if (token.startsWith('https://fanhive.jp/item/')) push(byMarker, token, id);
      }
      push(byTitleStart, `${ev.title}|${ev.startDate}|${ev.isAllDay ? 1 : 0}`, id);
    }
  } catch {
    return false; // 一覧が取れなければ従来どおり（作り直しになるが、同期を止めるよりはよい）
  }
  scannedThisSession = true;

  let changed = false;
  const taken = new Set<string>();
  for (const key of keys) {
    const d = desired[key];
    // 目印が無い時代に書いた予定のために、題名＋開始日時でも拾う。
    // ⚠️ 本人が自分で作った同名・同日時の予定を巻き込む可能性はあるが、
    //    題名は「作品名入りのグッズ名」「【締切】…」なので実際にはまず衝突しない
    const hit = (byMarker.get(markerFor(key)) ?? byTitleStart.get(`${d.title}|${d.startDate}|${d.isAllDay ? 1 : 0}`) ?? [])
      .filter((id) => !taken.has(id));
    // 目印が無い時代の締切予定は本体と説明欄が同じで、本体の目印で引っかかる。
    // 題名が一致するものがあればそちらだけを見る（本体のキーで締切を消してしまわないように）
    const titled = hit.filter((id) => titleById.get(id) === d.title);
    const found = titled.length ? titled : hit;
    if (!found.length) continue;
    const prev = map[key];
    const keep = prev && found.includes(prev.id) ? prev.id : found[0]; // 今使っているものを優先して残す
    taken.add(keep);
    if (!prev || prev.id !== keep) {
      map[key] = { id: keep, hash: '' }; // 中身は下の更新処理で必ず揃え直す（目印の追加もここで入る）
      changed = true;
    }
    const dupes = found.filter((id) => id !== keep);
    if (dupes.length) {
      try {
        await CapacitorCalendar.deleteEventsById({ ids: dupes });
        changed = true;
      } catch { /* 次回に持ち越す */ }
    }
  }
  return changed;
}

/** 起動・復帰時に端末カレンダーを現在の保存内容へ揃える。
 *  差分だけを触る（毎回消して入れ直すと、カレンダーアプリの通知が鳴り直したり同期が重くなる）。 */
export async function syncDeviceCalendar(events: CalendarEvent[]): Promise<void> {
  if (!deviceCalendarSupported() || !isDeviceCalendarOn()) return;
  const calendarId = getTargetCalendarId();
  if (!calendarId) return;
  // 権限を後から切られたら黙って止まる（ics購読は生きているので予定が消えるわけではない）
  if (!(await canWriteCalendar())) return;

  const desired = buildDesired(events);
  const map = loadMap();
  let changed = await adoptExisting(calendarId, desired, map);

  for (const [key, d] of Object.entries(desired)) {
    const hash = hashOf(d);
    const prev = map[key];
    const options = {
      title: d.title, startDate: d.startDate, endDate: d.endDate,
      isAllDay: d.isAllDay, description: d.description, location: d.location, url: d.url, calendarId,
      ...(d.color ? { color: d.color } : {}),
    };
    try {
      if (!prev) {
        const { id } = await CapacitorCalendar.createEvent(options);
        map[key] = { id: String(id), hash };
        changed = true;
      } else if (prev.hash !== hash) {
        await CapacitorCalendar.modifyEvent({ id: prev.id, ...options });
        map[key] = { id: prev.id, hash };
        changed = true;
      }
    } catch {
      // 1件の失敗で全体を止めない。次回の同期で作り直しを試みる
      if (!prev) continue;
      delete map[key];
      changed = true;
    }
  }

  // いいねを外した・予定が消えた分を削除する
  const stale = Object.keys(map).filter((k) => !desired[k]);
  if (stale.length) {
    try { await CapacitorCalendar.deleteEventsById({ ids: stale.map((k) => map[k].id) }); } catch { /* 次回に持ち越す */ }
    for (const k of stale) delete map[k];
    changed = true;
  }

  if (changed) saveMap(map);
}

let pendingSync: ReturnType<typeof setTimeout> | undefined;

/** いいね・投稿の直後に呼ぶ。起動・復帰を待たずに端末カレンダーへ反映する。
 *  連打されるので少し待ってから1回だけ走らせる（保存内容の取得ごと間引く）。
 *  ⚠️ `listSavedEvents` は動的importで取る。静的にすると api.ts ↔ deviceCalendar.ts が循環する。 */
export function requestDeviceCalendarSync(userId: string, delayMs = 1500): void {
  if (!deviceCalendarSupported() || !isDeviceCalendarOn()) return;
  clearTimeout(pendingSync);
  pendingSync = setTimeout(() => {
    void (async () => {
      try {
        const { listSavedEvents } = await import('./api');
        await syncDeviceCalendar(await listSavedEvents(userId));
      } catch { /* 失敗しても次の起動・復帰時の同期で揃う */ }
    })();
  }, delayMs);
}
