// tailwind.config.js  (ESM)
import { mauve, mauveDark, plum, plumDark } from '@radix-ui/colors'

const mapScale = (scale) =>
  Object.fromEntries(
    Object.entries(scale).map(([k, v]) => [k.replace(/\\D/g, ''), v])
  )

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mauve: mapScale(mauve),
        'mauve-dark': mapScale(mauveDark),
        plum: mapScale(plum),
        'plum-dark': mapScale(plumDark),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
