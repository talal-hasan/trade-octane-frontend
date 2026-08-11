import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// PrimeNG theme preset aligned to Trade Octane design tokens (CLAUDE.md §5).
// Color values are duplicated here (rather than read from CSS custom properties)
// because PrimeNG's theme system resolves palettes at build/init time, not via
// runtime CSS var lookups. Keep in sync with src/styles/_tokens.scss.
export const TradeOctanePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#edf1fb',
      100: '#d7e1f6',
      200: '#b0c3ed',
      300: '#88a5e4',
      400: '#618edb',
      500: '#3b6fd4',
      600: '#2f5ab8',
      700: '#26489a',
      800: '#1e3f8a',
      900: '#182e63',
      950: '#101f45',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f6f7f9',
          100: '#f0f2f5',
          200: '#e2e5ea',
          300: '#c8cdd6',
          400: '#a6acb8',
          500: '#8a96a8',
          600: '#4a5568',
          700: '#141922',
          800: '#0f1117',
          900: '#0a0c10',
          950: '#050608',
        },
        primary: {
          color: '#3b6fd4',
          contrastColor: '#ffffff',
          hoverColor: '#2f5ab8',
          activeColor: '#2f5ab8',
        },
        text: {
          color: '#141922',
          hoverColor: '#141922',
          mutedColor: '#8a96a8',
        },
      },
      dark: {
        // PrimeNG semantic tokens reference this ramp via light-dark({surface.LOW},
        // {surface.HIGH}) — e.g. overlay background is light-dark(surface.0, surface.900).
        // The ramp direction (0 = lightest, 950 = darkest) must stay the SAME in both
        // color schemes; only the actual hex values differ. Getting this backwards (an
        // earlier version of this file had 0=dark…950=white here) made every light-dark()
        // driven surface — dialogs, popovers, menus, inputs — resolve to white in dark mode.
        surface: {
          0: '#ffffff',
          50: '#e8ecf4',
          100: '#c5cbda',
          200: '#9aa3b8',
          300: '#7b8499',
          400: '#5a6478',
          500: '#4a5568',
          600: '#374155',
          700: '#2a3042',
          800: '#1f2433',
          900: '#181c25',
          950: '#0f1117',
        },
        primary: {
          color: '#5b8dee',
          contrastColor: '#0f1117',
          hoverColor: '#7aa3f5',
          activeColor: '#7aa3f5',
        },
        text: {
          color: '#e8ecf4',
          hoverColor: '#e8ecf4',
          mutedColor: '#5a6478',
        },
      },
    },
  },
});
