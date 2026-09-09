/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#f8f7f7', 2: '#ffffff', 3: '#f2f0f0' },
        surface: { DEFAULT: '#f5f3f3', 2: '#ede9e9' },
        border: { DEFAULT: '#e5e0e0', 2: '#d4cccc' },
        crimson: { DEFAULT: '#5D0F0F', 2: '#7a1a1a' },
        rose: '#895353',
        taupe: '#A98D8C',
        blush: '#E9D8D5',
        text: { DEFAULT: '#1a1314', 2: '#4a3a3a', 3: '#8a7070' },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['DM Serif Display', 'serif'],
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: { fadeUp: 'fadeUp 0.16s ease' },
    },
  },
  plugins: [],
}
