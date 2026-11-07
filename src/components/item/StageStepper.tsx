import { stageFlow } from '../../design/tokens';
import type { CalendarEvent } from '../../types';

/** 予約開始前 ─ 予約受付中 ─ 締切 ─ 発売中 ─ 発売済 のように段階を並べ、今の段階に色を付ける。
 *  過ぎた段階は灰色、これからの段階は白抜き（2026-11-07 デザインの一新: 色は今の段階だけ） */
export default function StageStepper({ event }: { event: CalendarEvent }) {
  const { steps, current } = stageFlow(event);
  return (
    <ol className="flex items-start" aria-label="段階">
      {steps.map((label, i) => {
        const now = i === current;
        const past = i < current;
        return (
          <li key={label} className="flex-1 min-w-0 flex flex-col items-center relative" aria-current={now ? 'step' : undefined}>
            {/* 前の段階とつなぐ線（点の中心どうし） */}
            {i > 0 && (
              <span className="absolute top-[5px] right-1/2 w-full h-[2px]"
                style={{ backgroundColor: i <= current ? 'var(--label-secondary)' : 'var(--fill-secondary, rgba(120,120,128,0.2))' }} />
            )}
            <span className="relative w-3 h-3 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: now ? 'var(--accent-color)' : past ? 'var(--label-secondary)' : 'var(--bg-primary)',
                border: now || past ? 'none' : '2px solid var(--fill-secondary, rgba(120,120,128,0.3))',
                boxShadow: now ? '0 0 0 4px color-mix(in srgb, var(--accent-color) 25%, transparent)' : undefined,
              }} />
            <span className={`mt-2 text-[10.5px] leading-tight text-center whitespace-nowrap ${now ? 'font-extrabold' : 'font-semibold'}`}
              style={{ color: now ? 'var(--label-primary)' : past ? 'var(--label-secondary)' : 'var(--label-tertiary)' }}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
