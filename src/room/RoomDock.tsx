import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CalendarEvent } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { loadMyGot, toGoods, toSamples } from './data';
import type { RoomState } from './engine';
import { pushAppState } from '../lib/appState';
import { shareImage } from '../lib/shareImage';
import { loadHintsSeen, markHintsSeen } from '../lib/hintsSeen';
import './room.css';

// ホームの下からのぞくカバン。押すとゲーム機が出てきて、自分の部屋に入れる（試作 第7版を移した）。
// three.js は重いので、このカバンを出すときに初めて読み込む

// 部屋の状態は端末に置き、アカウントにも上げる（user_app_state.room。列がまだ無い環境では端末だけ）
const STATE_KEY = 'fan_room_state';
const readState = (): RoomState | null => { try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as RoomState | null; } catch { return null; } };
const saveState = (s: RoomState) => { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* なし */ } pushAppState('room', s); };
const HINT_ID = 'room-bag';

let fontLinked = false;
function linkFont() {
  if (fontLinked) return; fontLinked = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap'; document.head.appendChild(l);
}

export default function RoomDock({ events }: { events: CalendarEvent[] | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(() => !loadHintsSeen().has(HINT_ID));
  const evRef = useRef(events); evRef.current = events;
  const ready = !!events;

  useEffect(() => {
    const root = ref.current, events = evRef.current; if (!root || !events) return;
    linkFont();
    let stop: (() => void) | null = null, cancelled = false;
    const setNav = () => { const h = document.querySelector('[data-bottom-nav]')?.getBoundingClientRect().height ?? 78; root.style.setProperty('--fhr-nav', h + 'px'); document.documentElement.style.setProperty('--fhr-nav', h + 'px'); };
    setNav();
    void (async () => {
      const [{ startRoom }, { ROOM_MARKUP }, got] = await Promise.all([import('./engine'), import('./markup'), user ? loadMyGot(user.id) : Promise.resolve([])]);
      if (cancelled) return;
      const samples = toSamples(events);
      let goods = toGoods(got);
      // まだ何も「買った」を押していない人には、見本を置いておく（プレビューで見るため）
      if (!goods.length) goods = samples.slice(0, 9).map((s, i) => ({ id: 'sample-' + i, img: s.img, title: s.title, sub: '見本（「買った」を押すと自分のグッズが届く）', kind: (['stand', 'card', 'badge', 'card', 'poster', 'badge', 'stand', 'card', 'badge'] as const)[i], h: 0.45 }));
      root.innerHTML = ROOM_MARKUP;
      const r = startRoom(root, { goods, samples, userId: user?.id, state: readState(), save: saveState, share: shareImage, onMatome: () => navigate('/matome'),
        onOpen: () => { markHintsSeen(HINT_ID); setHint(false); } });
      stop = r.destroy;
    })();
    return () => { cancelled = true; stop?.(); root.innerHTML = ''; };
  }, [ready, user, navigate]);

  return (
    <>
      <div ref={ref} className="fhr" />
      {/* はじめての人に: カバンの中のゲーム機が、マイホームの入口 */}
      {hint && (
        <div className="fhr-hint" role="note">
          <b>マイホーム</b>
          <span>ゲーム機を押すと、買ったグッズを飾った部屋に入れる</span>
        </div>
      )}
    </>
  );
}
