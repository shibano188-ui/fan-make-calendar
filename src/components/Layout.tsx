import type { ReactNode } from 'react';
import BottomTab from './BottomTab';

interface Props {
  children: ReactNode;
  hideBottomTab?: boolean;
}

export default function Layout({ children, hideBottomTab = false }: Props) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="mx-auto w-full max-w-app min-h-screen flex flex-col">
        <main className={`flex-1 ${hideBottomTab ? '' : 'pb-[106px]'}`}>
          {children}
        </main>
        {!hideBottomTab && <BottomTab />}
      </div>
    </div>
  );
}
