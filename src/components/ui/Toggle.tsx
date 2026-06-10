interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, disabled = false }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        width: 51,
        height: 31,
        backgroundColor: checked ? 'var(--color-success)' : 'var(--fill-secondary)',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white transition-transform duration-200"
        style={{
          width: 27,
          height: 27,
          left: 2,
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35), 0 0 1px rgba(0,0,0,0.1)',
        }}
      />
    </button>
  );
}
