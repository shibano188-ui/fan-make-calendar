import { STATUS, statusLabel, type ItemStatus, type ItemType } from '../../design/tokens';

interface Props {
  status: ItemStatus;
  type?: ItemType;
  size?: 'sm' | 'md';
}

/** アイテムの状態（5段階）を色分けバッジで表示。色は状態色トークン。 */
export default function StatusBadge({ status, type = 'event', size = 'sm' }: Props) {
  const meta = STATUS[status];
  return (
    <span
      className="inline-flex items-center font-semibold rounded-full leading-none"
      style={{
        color: '#fff',
        backgroundColor: meta.color,
        padding: size === 'md' ? '3px 8px' : '2px 6px',
        fontSize: size === 'md' ? 12 : 11,
      }}
    >
      {statusLabel(status, type)}
    </span>
  );
}
