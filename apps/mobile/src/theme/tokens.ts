// Paleta "original" (escura/roxa) extraída de src/app/globals.css, tema padrão do Clube do Jogo.
export const colors = {
  background: '#08080a',
  foreground: '#f4f4f5',
  surface: '#101014',
  surfaceSoft: 'rgba(255,255,255,0.035)',
  surfaceSofter: 'rgba(255,255,255,0.025)',
  surfaceDeep: 'rgba(0,0,0,0.24)',
  card: '#0c0c0f',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineSoft: 'rgba(255,255,255,0.07)',

  violet300: '#c4b5fd',
  violet400: '#a78bfa',
  violet500: '#8b5cf6',
  violet600: '#7c3aed',
  fuchsia600: '#c026d3',

  zinc300: '#d4d4d8',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
  zinc600: '#52525b',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
  zinc950: '#09090b',

  amber200: '#fde68a',
  amber300: '#fcd34d',
  amber400: '#fbbf24',
  amber600: '#d97706',
  amber900: '#78350f',
  amber950: '#451a03',

  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald500: '#10b981',

  sky400: '#38bdf8',

  red300: '#fca5a5',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',

  pink400: '#f472b6',

  supportVote: '#8b5cf6',
  supportCompleted: '#10b981',
  supportBacklog: '#38bdf8',
  supportDanger: '#ef4444',

  white: '#ffffff',
  black: '#000000',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontWeights = {
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const typography = {
  h1: { fontSize: 30, fontWeight: fontWeights.black, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: fontWeights.black, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: fontWeights.extrabold },
  body: { fontSize: 14, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '600' as const },
  tiny: { fontSize: 10, fontWeight: fontWeights.extrabold, letterSpacing: 0.6, textTransform: 'uppercase' as const },
} as const;
