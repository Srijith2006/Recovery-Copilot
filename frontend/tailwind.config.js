/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep navy-black radar-screen background — not pure black, has a blue cast.
        void: {
          DEFAULT: '#0A0F1C',
          panel: '#111A2E',
          grid: '#1E2A44',
        },
        // Functional status colors, borrowed from real radar/sonar convention:
        // amber = contact/threat (at risk), green = cleared (recovered),
        // cyan = active scan (in progress), red = lost/stopped.
        risk: '#F5A623',
        recovered: '#34D399',
        scan: '#38E1C6',
        stopped: '#F2637A',
        ink: {
          DEFAULT: '#E6EDF7',
          muted: '#7C8CA6',
          faint: '#4B5872',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', '"IBM Plex Sans"', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(30,42,68,0.6), 0 8px 24px -8px rgba(0,0,0,0.5)',
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        blipPulse: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.6, transform: 'scale(1.4)' },
        },
      },
      animation: {
        sweep: 'sweep 4s linear infinite',
        blipPulse: 'blipPulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};