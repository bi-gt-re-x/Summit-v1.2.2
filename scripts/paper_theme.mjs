/**
 * Writes the paper look's colour layer.
 *
 *     node scripts/paper_theme.mjs           # rewrite frontend/src/styles/paper-remap.css
 *     node scripts/paper_theme.mjs --check   # fail if it's out of date
 *
 * The paper look (warm off-white ground, sage accent, charcoal ink) covers the
 * rail, the top bar, the Dashboard, the Calendar, Goals, Tasks, Analytics
 * (every tab and the subject pages), the Skill Tree, Log, Notes,
 * Achievements, Settings and the Timer, with every popup they open, and the
 * graph-paper background behind them. Those sheets state most of their colours as literals, so a token
 * swap can't reach them. This reads each one and writes the same rules again
 * with every colour moved onto the paper palette, behind a prefix that only
 * matches the default light look:
 *
 * - SHELL sheets get `html:not([data-skin]):not([data-theme="dark"])`, so the
 *   rail and top bar are paper on every page.
 * - PAGE sheets also need `:has(.dash, .calendar-container, .gx-page,
 *   .tk-page, .ax-page, .stx-page, .lg-page, .nt-page, .rc-page, .st-page,
 *   .pom-page)`, so they only change while one of those pages is open. That includes the
 *   shared ones (ui.css, the task dialog, the tour) and the popups those pages
 *   portal into <body>.
 *
 * Every colour property of every rule is copied, literal or not, so states
 * keep their order: a hover written as var(--color-accent) still beats the
 * base rule it sat above. Dark mode and the skins never match the prefix and
 * keep their own colours. Shapes, fonts and the hand-tuned parts live in
 * frontend/src/styles/paper.css.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = join(root, 'frontend/src/styles');
const OUT = join(STYLES, 'paper-remap.css');

const SHELL = ['rail.css', 'topbar.css', 'nametag.css', 'search.css', 'notifications.css'];
const PAGES = [
  'ui.css',
  'summit.css',
  'dashboard.css',
  'dashboard-home.css',
  'timer.css',
  'focus-session.css',
  'catch-up.css',
  'rate-prompt.css',
  'day-complete.css',
  'subject-picker.css',
  'subject-state.css',
  'next-sessions.css',
  'starter.css',
  'page-state.css',
  'refresh-button.css',
  'verify-banner.css',
  'tutorial.css',
  'goals.css',
  'calendar/shell.css',
  'calendar/dialogs.css',
  'calendar/overview.css',
  'calendar/day.css',
  'calendar/week.css',
  'calendar/month.css',
  'calendar/palette.css',
  'tasks.css',
  'analytics.css',
  'growth.css',
  'subject.css',
  'subject-objective.css',
  'skilltree.css',
  'notes.css',
  'log.css',
  'records.css',
  'achievements.css',
  'settings.css',
  'themePicker.css',
  'about-you.css',
  'ambient.css',
];

const LIGHT = 'html:not([data-skin]):not([data-theme="dark"])';
const ON_PAGE = `${LIGHT}:has(.dash, .calendar-container, .gx-page, .tk-page, .ax-page, .stx-page, .lg-page, .nt-page, .rc-page, .st-page, .pom-page)`;

// Colours that belong to what someone wrote rather than to the page: the nine
// inks a note can be written in. A red note stays red in every look.
const KEEP = /^--nt-ink-/;

const COLOR_PROPS = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|border-block(-start|-end)?(-color)?|border-inline(-start|-end)?(-color)?|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration|text-decoration-color|column-rule|column-rule-color|filter|stop-color|scrollbar-color|-webkit-text-fill-color|--.*)$/;

// --------------------------------------------------------------------------
// Colour
// --------------------------------------------------------------------------
const SAGE = [139, 150, 137]; // #8B9689, the mockups' buttons and selected tabs

function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function rgb([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function kind(prop) {
  if (/^(color|-webkit-text-fill-color|caret-color|text-decoration(-color)?)$/.test(prop)) return 'text';
  if (/^background/.test(prop)) return 'bg';
  if (/^(border|outline|column-rule)/.test(prop)) return 'line';
  if (/shadow|filter/.test(prop)) return 'shadow';
  return 'other';
}

const BUTTONISH = /btn|button|-add\b|add-|primary|cta|start|-new\b|new-|save|submit|claim|-go\b|launch|book/;
const DANGER = /danger|delete|remove|-del\b|stop|warn|overdue|late|error|bad/;

/** One colour onto the paper palette. */
function paper(c, prop, selector) {
  const [r, g, b] = c;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const role = kind(prop);
  const [h, s, l] = hsl(c);

  if (chroma < 20 || s < 0.1) {
    if (role === 'text' && y > 232) return [255, 255, 255];
    if (role === 'bg' && y < 90 && BUTTONISH.test(selector)) return SAGE;
    if ((role === 'bg' || role === 'line' || role === 'other') && y >= 250) return [250, 248, 244];
    const level = y < 70 ? 43 : y;
    const tint = level >= 200 ? [2, 1, -3] : level >= 80 ? [1, 1, -2] : [-1, 1, -1];
    return tint.map((t) => clamp(Math.round(level + t), 0, 255));
  }

  // Every action button is sage in the mockups, whatever colour it was,
  // except the ones that warn: delete, remove, stop.
  if (role === 'bg' && l > 0.28 && l < 0.75 && BUTTONISH.test(selector) && !DANGER.test(selector)) {
    return rgb([108, 0.08, l < 0.42 ? 0.48 : 0.56]);
  }

  const violet = h >= 232 && h <= 300;
  const taupe = h >= 18 && h <= 45 && s < 0.32 && l > 0.38 && l < 0.72;
  if (violet || taupe) {
    if (l > 0.84) return rgb([100, 0.13, Math.max(l, 0.9)]);
    if (role === 'text') return rgb([115, 0.1, clamp(l, 0.38, 0.5)]);
    return rgb([108, 0.08, l < 0.42 ? 0.48 : l > 0.72 ? 0.66 : 0.56]);
  }

  if (l > 0.84) return rgb([h, Math.min(s * 0.5, 0.34), Math.max(l, 0.88)]);
  return rgb([h, Math.min(s * 0.42, 0.34), clamp(l * 0.9 + 0.06, 0.32, 0.72)]);
}

const HEX = '#[0-9a-fA-F]{3,8}\\b';
const FUNC = 'rgba?\\([^)]*\\)';
const NAMED = '\\b(?:white|black)\\b';
const COLOR = new RegExp(`${HEX}|${FUNC}|${NAMED}`, 'g');

function parse(token) {
  if (token === 'white') return [[255, 255, 255], 1];
  if (token === 'black') return [[0, 0, 0], 1];
  if (token.startsWith('#')) {
    let hex = token.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [[n(0), n(2), n(4)], hex.length === 8 ? n(6) / 255 : 1];
  }
  const parts = token
    .replace(/rgba?\(|\)/g, '')
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => p.includes('%') || p.includes('var'))) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [parts.slice(0, 3).map(Number), alpha];
}

function format([r, g, b], alpha) {
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (alpha >= 1) return hex;
  return `rgba(${r}, ${g}, ${b}, ${+alpha.toFixed(3)})`;
}

function remap(value, prop, selector) {
  return value.replace(COLOR, (token) => {
    const parsed = parse(token);
    if (!parsed) return token;
    return format(paper(parsed[0], prop, selector), parsed[1]);
  });
}

// --------------------------------------------------------------------------
// Rules
// --------------------------------------------------------------------------
function prefixed(selector, prefix) {
  // Split at the top-level commas only: `:is(h2, h3)` is one selector.
  return postcss.list
    .comma(selector)
    .map((one) => one.trim())
    .filter((one) => one && !/data-theme|data-skin|data-accent/.test(one))
    .map((one) => {
      if (/^html\b/.test(one)) return prefix + one.slice(4);
      if (/^:root\b/.test(one)) return prefix + one.slice(5);
      return `${prefix} ${one}`;
    })
    .join(',\n');
}

function inKeyframes(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && /keyframes|font-face/.test(p.name)) return true;
  }
  return false;
}

function convert(file, prefix) {
  const source = postcss.parse(readFileSync(join(STYLES, file), 'utf8'));
  const out = postcss.root();
  source.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    const selector = prefixed(rule.selector, prefix);
    if (!selector) return;
    const decls = [];
    rule.each((node) => {
      if (node.type !== 'decl' || !COLOR_PROPS.test(node.prop) || KEEP.test(node.prop)) return;
      if (node.prop.startsWith('--') && !COLOR.test(node.value) && !/var\(/.test(node.value)) return;
      COLOR.lastIndex = 0;
      decls.push(postcss.decl({ prop: node.prop, value: remap(node.value, node.prop, rule.selector), important: node.important }));
    });
    if (!decls.length) return;
    const copy = postcss.rule({ selector });
    decls.forEach((d) => copy.append(d));
    // Same @media / @supports around it as the original.
    let target = copy;
    for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
      const wrap = postcss.atRule({ name: p.name, params: p.params });
      wrap.append(target);
      target = wrap;
    }
    out.append(target);
  });
  return out.toString();
}

const header = `/* GENERATED by scripts/paper_theme.mjs. Don't edit by hand: change the
   source sheet or the script, then run \`node scripts/paper_theme.mjs\`.
   The paper look's colours for the default light look. See that script for
   how it works and frontend/src/styles/paper.css for the hand-tuned half. */
`;

const body = [
  ...SHELL.map((file) => `\n/* ---- ${file} (every page) ---- */\n${convert(file, LIGHT)}`),
  ...PAGES.map((file) => `\n/* ---- ${file} (every paper page) ---- */\n${convert(file, ON_PAGE)}`),
].join('\n');

const css = header + body + '\n';

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== css) {
    console.error('paper-remap.css is out of date. Run: node scripts/paper_theme.mjs');
    process.exit(1);
  }
  console.log('paper-remap.css is up to date.');
} else {
  writeFileSync(OUT, css);
  console.log(`Wrote ${OUT.slice(root.length + 1)} (${css.split('\n').length} lines).`);
}
