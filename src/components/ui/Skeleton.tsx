// 読み込み中スケルトン（Phase G-3）
// 実カードと同じ構造（左日付列 + 本文行）で「読み込み後のガタつき」を防ぐ

export function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className="bg-bg-secondary rounded-[14px] overflow-hidden animate-pulse">
      <div className="flex items-stretch px-4 pt-4 pb-3 gap-3">
        <div className="flex-shrink-0 w-10 flex flex-col items-center gap-1.5 pt-0.5">
          <div className="w-7 h-3 rounded bg-fill-3" />
          <div className="w-8 h-4 rounded bg-fill-3" />
        </div>
        <div className="w-px self-stretch flex-shrink-0" style={{ backgroundColor: 'var(--separator)' }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex gap-1.5">
            <div className="w-12 h-4 rounded-full bg-fill-3" />
            <div className="w-16 h-4 rounded-full bg-fill-3" />
          </div>
          <div className="w-3/4 h-5 rounded bg-fill-3" />
          {tall && <div className="w-full h-24 rounded-lg bg-fill-4" />}
          <div className="w-1/2 h-3.5 rounded bg-fill-4" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, tall = false }: { count?: number; tall?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} tall={tall} />)}
    </div>
  );
}
