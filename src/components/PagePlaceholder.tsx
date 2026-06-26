interface Props {
  title: string;
  note?: string;
}

/** Phase 0 用の仮ページ。各画面の本実装で差し替える。 */
export default function PagePlaceholder({ title, note }: Props) {
  return (
    <div className="px-3 pt-4">
      <h1 className="text-[20px] font-bold">{title}</h1>
      {note && <p className="text-[13px] text-label-secondary mt-2">{note}</p>}
    </div>
  );
}
