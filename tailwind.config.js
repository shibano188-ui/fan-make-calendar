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
        accent: 'var(--accent-color)',
      },
      borderColor: {
        subtle:   'var(--border-subtle)',
        faint:    'var(--border-faint)',
        default:  'var(--border-default)',
        strong:   'var(--border-strong)',
        selected: 'var(--border-selected)',
      },
      maxWidth: {
        app: '480px',
      },
    },
  },
  plugins: [],
}
