import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      <p className="font-bold leading-none" style={{ fontSize: 72, color: 'var(--label-tertiary)' }}>404</p>
      <p style={{ fontSize: 17, color: 'var(--label-secondary)' }}>このページは存在しません</p>
      <button
        onClick={() => navigate('/')}
        className="mt-2 px-5 py-2.5 rounded-[14px] text-sm font-semibold active:opacity-70"
        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
      >
        ホームへ戻る
      </button>
    </div>
  );
}
