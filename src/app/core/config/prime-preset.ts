import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// PrimeNG theme preset aligned to Trade Octane design tokens (CLAUDE.md §5).
// Color values are duplicated here (rather than read from CSS custom properties)
// because PrimeNG's theme system resolves palettes at build/init time, not via
// runtime CSS var lookups. Keep in sync with src/styles/_tokens.scss.
//
// The primary ramp is built around FrieslandCampina Sky Blue #0094d9 (pms 3005),
// which sits at 500. Tints above it are the brand hex mixed toward Milk White;
// shades below are mixed toward black. 600 (#0076ae) is the button fill, chosen
// because white text on it clears AA at 5.0:1 — the raw brand hex only reaches
// 3.4:1 and is reserved for fills, rails and icons where no text sits on it.
export const TradeOctanePreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#e6f4fb',
      100: '#cceaf7',
      200: '#99d5ef',
      300: '#66bfe7',
      400: '#33aae0',
      500: '#0094d9', // ← FrieslandCampina Sky Blue, pms 3005, ral 5015
      600: '#0076ae',
      700: '#005f8c',
      800: '#00567f',
      900: '#003b57',
      950: '#002536',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff', // Milk white
          50: '#f4f6f8',
          100: '#eef1f4',
          200: '#dfe4e9',
          300: '#c3c9d1',
          400: '#a4aab2',
          500: '#8b9096',
          600: '#6e6f72', // Cool grey, pms Cool Grey 10c
          700: '#16181b',
          800: '#0b0d10',
          900: '#08090b',
          950: '#040506',
        },
        primary: {
          color: '#0076ae',
          contrastColor: '#ffffff',
          hoverColor: '#005f8c',
          activeColor: '#005f8c',
        },
        text: {
          color: '#16181b',
          hoverColor: '#16181b',
          mutedColor: '#8b9096',
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
          50: '#eef1f4',
          100: '#c8ccd2',
          200: '#a2a7ae',
          300: '#868b93',
          400: '#6e737b',
          500: '#4d535c',
          600: '#3a414c',
          700: '#272c34',
          800: '#1c2027',
          900: '#14171c',
          950: '#0b0d10',
        },
        primary: {
          color: '#29aae6',
          contrastColor: '#0b0d10',
          hoverColor: '#4dbcee',
          activeColor: '#4dbcee',
        },
        text: {
          color: '#eef1f4',
          hoverColor: '#eef1f4',
          mutedColor: '#6e737b',
        },
      },
    },
  },
});
