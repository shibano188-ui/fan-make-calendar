import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      <p className="text-[72px] font-bold leading-none" style={{ color: 'var(--label-tertiary)' }}>404</p>
      <p className="text-sm" style={{ color: 'var(--label-secondary)' }}>このページは存在しません</p>
      <button
        onClick={() => navigate('/')}
        className="mt-2 px-5 py-2.5 rounded-xl text-sm font-medium active:opacity-70"
        style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' }}
      >
        ホームへ戻る
      </button>
    </div>
  );
}
