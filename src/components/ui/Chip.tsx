import type { ReactNode } from 'react';

interface Props {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

/** しぼり込み用チップ（Airbnb式の横バー/フィルタシートで使う）。 */
export default function Chip({ active = false, onClick, children }: Props) {
  return (
    <button
      onClick={onClick}
      data-skin-part="chip"
      data-active={active ? '' : undefined}
      className="pressable inline-flex items-center gap-1 whitespace-nowrap rounded-full text-[13px] leading-none px-3 py-2"
      style={
        active
          ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
          : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }
      }
    >
      {children}
    </button>
  );
}
