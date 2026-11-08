/**
 * The paper look's four sheets, in the order they have to cascade.
 *
 * They used to be imported by main.tsx, which put 2.5 MB of CSS (about 170 KB
 * gzipped) in the one stylesheet every route waits on before it paints. Every
 * rule in them is scoped to the rail, the top bar or an app page (see
 * scripts/paper_theme.mjs), so the landing page and /login drew nothing from
 * them and still paid for all of it. On a phone that was most of the landing
 * page's first paint.
 *
 * They load through utils/paperLook.ts instead: before the first render on
 * an app route, and on the way into the app from the landing page.
 */
import './paper-remap.css';
import './paper.css';
import './paper-dark.css';
import './paper-dark-hand.css';
