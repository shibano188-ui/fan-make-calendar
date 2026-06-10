/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary:  'var(--bg-tertiary)',
        },
        label: {
          primary:   'var(--label-primary)',
          secondary: 'var(--label-secondary)',
          tertiary:  'var(--label-tertiary)',
        },
        input: {
          text:        'var(--input-text)',
          placeholder: 'var(--input-placeholder)',
        },
        fill: {
          1: 'var(--fill-primary)',
          2: 'var(--fill-secondary)',
          3: 'var(--fill-tertiary)',
          4: 'var(--fill-quaternary)',
        },
        accent:      'var(--accent-color)',
        destructive: 'var(--color-destructive)',
        success:     'var(--color-success)',
        warning:     'var(--color-warning)',
      },
      borderColor: {
        subtle:    'var(--border-subtle)',
        faint:     'var(--border-faint)',
        default:   'var(--border-default)',
        strong:    'var(--border-strong)',
        selected:  'var(--border-selected)',
        separator: 'var(--separator)',
      },
      maxWidth: {
        app: '480px',
      },
    },
  },
  plugins: [],
}
