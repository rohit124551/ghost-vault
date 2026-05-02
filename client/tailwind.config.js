/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bgBase: 'var(--bg-base)',
        bgCard: 'var(--bg-card)',
        bgHover: 'var(--bg-hover)',
        borderBase: 'var(--border)',
        borderActive: 'var(--border-active)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        textGhost: 'var(--text-ghost)',
        accent: 'var(--accent)',
        accentGlow: 'var(--accent-glow)',
        accentHover: 'var(--accent-hover)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        info: 'var(--info)',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
