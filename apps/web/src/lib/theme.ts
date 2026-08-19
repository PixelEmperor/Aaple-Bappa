export const THEME_STORAGE_KEY = 'aaple-bappa-theme'

/**
 * Runs synchronously in a blocking <script> in <head> (see layout.tsx),
 * before first paint — reading localStorage in a useEffect would flash the
 * wrong theme for a frame on every load. Stringified and inlined rather
 * than imported: this needs to run standalone in the browser, before any
 * bundle has loaded.
 */
export function themeInitScript(): string {
  return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var stored=localStorage.getItem(k);if(stored==='light'||stored==='dark'){document.documentElement.setAttribute('data-theme',stored)}}catch(e){}})()`
}

export type Theme = 'light' | 'dark'

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
