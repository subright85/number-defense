/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'nd-primary':       'var(--nd-primary)',
        'nd-accent-red':    'var(--nd-accent-red)',
        'nd-accent-orange': 'var(--nd-accent-orange)',
        'nd-accent-green':  'var(--nd-accent-green)',
        'nd-accent-blue':   'var(--nd-accent-blue)',
        'nd-accent-purple': 'var(--nd-accent-purple)',
        'nd-bg-deep':       'var(--nd-bg-deep)',
        'nd-bg-mid':        'var(--nd-bg-mid)',
        'nd-text-primary':  'var(--nd-text-primary)',
        'nd-text-muted':    'var(--nd-text-muted)',
      },
    },
  },
  plugins: [],
}

