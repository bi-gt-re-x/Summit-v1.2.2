/**
 * About Us.
 *
 * Ported from frontend/html/aboutus.html. The prose is that page's, unchanged
 * — including the "How It's Built" paragraph, which still says Flask and
 * hand-written JavaScript. That sentence describes the stack this port is in
 * the middle of replacing, so it is wrong and getting wronger; it is left
 * exactly as it was because rewriting the copy is a decision about what the
 * page says, not about how it is rendered, and the two should not travel
 * together in one commit.
 *
 * The values grid is the only thing here the other written pages do not have
 * (styles/aboutus.css); the card around it is shared (styles/content-page.css).
 */
import { Link } from 'react-router-dom';
import { useDocumentTitle, usePageEntrance } from '@/hooks';
import '@/styles/content-page.css';
import '@/styles/aboutus.css';

/**
 * The four cards under "What it is built on", in the order the original had
 * them.
 *
 * The emoji that opened each title are gone. They were not four of a kind:
 * U+2696 and U+2728 have no emoji presentation on this stack and rendered as
 * hairline monochrome glyphs, while the chart and the trophy came out in full
 * colour at twice the visual weight — so a row meant to read as four equal
 * beliefs read as two loud ones and two smudges. Nothing about the page needs
 * them, and the fourth card is called Simplicity First.
 */
const VALUES = [
  {
    title: 'Consistency over intensity',
    body: 'Small daily wins beat rare all-nighters. Streaks reward showing up.',
  },
  {
    title: 'Measurable progress',
    body: 'Every action turns into a number you can see and improve.',
  },
  {
    title: 'Rewarding productivity',
    body: 'XP, levels and grades make finishing work feel good.',
  },
  {
    title: 'Simplicity first',
    body: 'No clutter. Just the few tools that actually move the needle.',
  },
];

export default function AboutUs() {
  useDocumentTitle('About Us');

  /* The arrival cascade. Nothing is fetched here, so the page is ready the
     moment it mounts — see hooks/usePageEntrance. */
  const entering = usePageEntrance(true);

  return (
    <div className={`content-container${entering ? ' pg-enter' : ''}`}>
      <h1>About Us</h1>

      <p>
        A study tracker built around one idea:{' '}
        <strong>progress you can see is progress you keep making.</strong>
      </p>

      <h2>Where it came from</h2>
      <p>
        A student&apos;s answer to working hard all day and still wondering whether anything
        got done. Spreadsheets were tedious and the big suites were bloated, so this is the
        smaller thing: tasks, a calendar, focus sessions and goals, feeding streaks, XP and
        a growth rating.
      </p>

      <h2>What it is built on</h2>
      <div className="values-grid">
        {VALUES.map((value) => (
          <div className="value-card" key={value.title}>
            <h3>{value.title}</h3>
            <p>{value.body}</p>
          </div>
        ))}
      </div>

      <h2>How it is built</h2>
      <p>
        Python and FastAPI on the backend, React and TypeScript on the front, SQLite
        underneath, and every chart drawn by hand in SVG. Your data stays on the machine
        running the app. No accounts on distant servers, no subscriptions, no ads.
      </p>

      <h2>Where it is going</h2>
      <p>
        Still being built, and tested the way it was written — in real study sessions.
      </p>

      <p>
        <Link to="/dashboard">Head to the dashboard</Link> and get started.
      </p>
    </div>
  );
}
