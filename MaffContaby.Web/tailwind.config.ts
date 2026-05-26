import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          emerald: '#006666',
          'emerald-dark': '#005555',
          navy: '#003366',
          aqua: '#339999',
          sky: '#6699CC',
        },
        primary: {
          DEFAULT: '#006666',
          hover: '#005555',
          light: 'rgba(0,102,102,0.08)',
          mid: 'rgba(0,102,102,0.16)',
        },
        danger: {
          DEFAULT: '#D32F2F',
          light: '#FFEBEE',
          dark: '#B71C1C',
        },
        warning: {
          DEFAULT: '#F57C00',
          light: '#FFF3E0',
          dark: '#E65100',
        },
        sidebar: {
          bg: '#003366',
          text: 'rgba(255,255,255,0.85)',
          muted: 'rgba(255,255,255,0.50)',
          border: 'rgba(255,255,255,0.10)',
          hover: 'rgba(255,255,255,0.10)',
          active: 'rgba(255,255,255,0.16)',
        },
        surface: '#FFFFFF',
        bg: '#F0F0F0',
        border: '#E0E0E0',
        muted: '#4B5563',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 4px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)',
        md: '0 8px 24px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05)',
        lg: '0 16px 40px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.06)',
      },
      width: {
        sidebar: '260px',
      },
    },
  },
} satisfies Config;
