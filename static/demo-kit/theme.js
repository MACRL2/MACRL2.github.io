// theme.js — read the site's CSS design tokens and fan out light/dark changes.
// Demos resolve colors through Theme.tokens() (never hardcode) and re-render on
// Theme.onChange so canvas content matches the active theme.
const TOKEN_VARS = {
  accent: '--accent', fg: '--fg', bg: '--bg', muted: '--fg-muted',
  faint: '--fg-faint', rule: '--rule', surface: '--surface',
};

export const Theme = {
  tokens() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const [k, v] of Object.entries(TOKEN_VARS)) {
      out[k] = cs.getPropertyValue(v).trim();
    }
    return out;
  },
  onChange(cb) {
    const handler = () => cb(this.tokens());
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  },
};
