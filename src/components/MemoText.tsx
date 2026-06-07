import { Fragment } from 'react';

type Props = {
  text: string;
  className?: string;
};

export default function MemoText({ text, className }: Props) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className={className} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (!part.startsWith('http')) return part;
        // Strip trailing Japanese/ASCII punctuation that's not part of the URL
        const cleanUrl = part.replace(/[）)】」。、,\.]+$/, '');
        const suffix = part.slice(cleanUrl.length);
        return (
          <Fragment key={i}>
            <a
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}
              onClick={(e) => e.stopPropagation()}
            >
              {cleanUrl}
            </a>
            {suffix}
          </Fragment>
        );
      })}
    </p>
  );
}
