import { safeHref } from '../lib/url';

type Props = {
  sourceUrl?: string | null;
};

/** Xから取り込んだ予定（sourceUrlあり）に付ける「出典あり」バッジ。タップで元ポストへ。 */
export default function SourceBadge({ sourceUrl }: Props) {
  if (!sourceUrl) return null;
  return (
    <a
      href={safeHref(sourceUrl)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border active:opacity-60 flex-shrink-0"
      style={{ borderColor: 'var(--separator)', color: 'var(--label-secondary)' }}
    >
      <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      ソース
    </a>
  );
}
