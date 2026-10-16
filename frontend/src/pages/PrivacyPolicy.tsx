/**
 * The privacy policy.
 *
 * ## Why this was rewritten
 *
 * The previous version was ported word for word from privacy-policy.html, on
 * the principle that a published policy is not something a port gets to
 * improve. That was right about ports and wrong about this text, because the
 * text described a different product: it said data was stored "locally — in
 * your browser's local storage and in data files on the machine running the
 * app" and that it "never leaves your device unless you copy it yourself".
 *
 * That was true when the only machine running Summit was the author's laptop.
 * On a hosted install every word of it is false — the data is in a database on
 * a server, reached over the network, and the account holder is not the person
 * who administers it. A privacy policy that is wrong in the reader's favour is
 * worse than none: it is the document they would point at afterwards.
 *
 * So this version says what the code does, and each section is checkable
 * against it:
 *
 *   e-mail and verification    backend/routes/auth.py, tracking/auth.py
 *   what is stored, and where  data/sql/*.sql, database/connection.py
 *   the model features         tracking/planner.py, tracking/subject_goal.py
 *   comparison between users   none — nothing reads across accounts
 *   cookies                    main.py (session), routes/theme.py
 *   deletion                   the Reset and delete section of Settings
 *
 * If one of those changes, this page changes with it. **It is a description of
 * the software, not legal advice** — anyone deploying this to real users
 * should have it reviewed. The contact address in section 10 is
 * utils/contact.ts.
 *
 * The card, the headings and the dark theme live in styles/content-page.css,
 * shared with About Us and the Terms of Service — all three were the same
 * page with different words in it.
 */
import { useDocumentTitle, usePageEntrance } from '@/hooks';
import { CONTACT_EMAIL } from '@/utils/contact';
import '@/styles/content-page.css';

export default function PrivacyPolicy() {
  useDocumentTitle('Privacy Policy');

  /* The arrival cascade. Nothing is fetched here, so the page is ready the
     moment it mounts — see hooks/usePageEntrance. */
  const entering = usePageEntrance(true);

  return (
    <div className={`content-container${entering ? ' pg-enter' : ''}`}>
      <h1>Privacy Policy</h1>
      <p className="effective-date">Effective date: September 6, 2026</p>

      <p>
        Summit (&quot;we&quot; or &quot;the app&quot;) is a study and productivity tracker. Here&apos;s
        what it collects, where it lives and what you can do about it.
      </p>
      <p>
        <strong>The short version:</strong> your data lives on the server that runs Summit. It&apos;s
        never sold or used for ads. You can export or delete all of it from Settings anytime.
      </p>

      <h2>1. What we collect</h2>
      <p>When you make an account:</p>
      <ul>
        <li>
          <strong>Email:</strong> Used to confirm your account, sign you in and send account
          emails. That&apos;s it.
        </li>
        <li>
          <strong>Name and username:</strong> Your name says hi. Your username is where your stuff
          is saved.
        </li>
        <li>
          <strong>Password:</strong> Saved only as a scrambled hash. Nobody can read it. Even we can&apos;t.
        </li>
        <li>
          <strong>Google sign-in:</strong> Google sends us your email and name. We never see your
          Google password.
        </li>
      </ul>
      <p>As you use the app:</p>
      <ul>
        <li>
          <strong>Tasks and goals:</strong> Titles, notes, subjects, due dates, checkpoints, your
          ratings and the scores you log.
        </li>
        <li>
          <strong>Calendar:</strong> Events and tasks you put on it.
        </li>
        <li>
          <strong>Notes and records:</strong> Anything you write there.
        </li>
        <li>
          <strong>Activity:</strong> Focus time, finished tasks, XP and streaks. Analytics is built
          from these.
        </li>
        <li>
          <strong>Settings:</strong> Your theme, goals, start page and setup answers.
        </li>
      </ul>
      <p>
        We don&apos;t collect payment info, your location, contacts or ad IDs. No ads, no
        third-party tracking and no tracking pixels.
      </p>

      <h2>2. Where your data lives</h2>
      <ul>
        <li>
          <strong>On the server:</strong> Everything is in one database on the server that runs
          Summit. Whoever runs that server can see it. That&apos;s normal for a web app, and we&apos;d
          rather just tell you.
        </li>
        <li>
          <strong>Two cookies:</strong> One keeps you signed in. One remembers your theme. The
          sign-in cookie is locked down (Secure and HttpOnly), so page scripts can&apos;t read it.
        </li>
      </ul>

      <h2>3. How we use it</h2>
      <p>Only to run the app for you:</p>
      <ul>
        <li>Showing your tasks, goals, notes and calendar.</li>
        <li>Working out your streaks, XP, levels, scores and tips.</li>
        <li>Sending account emails. No marketing.</li>
        <li>Remembering your settings.</li>
      </ul>
      <p>We don&apos;t profile you for ads, and we don&apos;t sell or rent anything.</p>

      <h2>4. Other companies</h2>
      <ul>
        <li>
          <strong>AI, only when you ask:</strong> Buttons that draft checkpoints, steps, goals,
          study sessions or subject tips send a short summary to an AI provider. That&apos;s
          Anthropic, Groq or Hugging Face, depending on how this copy is set up. The summary can
          include your goal text, checkpoint names, and recent task titles, ratings and counts.
          Your email, password and notes are never sent.
        </li>
        <li>
          <strong>Google, if you pick it:</strong> &quot;Continue with Google&quot; works the
          usual way. Google tells us your email and name.
        </li>
        <li>
          <strong>Fonts:</strong> Your browser loads fonts from Google Fonts.
        </li>
      </ul>
      <p>That&apos;s everything. None of it is for ads.</p>

      <h2>5. No comparing you with others</h2>
      <p>
        Summit never ranks you against other people. Every number you see comes from your own
        work.
      </p>

      <h2>6. Keeping and deleting data</h2>
      <ul>
        <li>
          <strong>Kept until you delete it:</strong> Remove tasks, goals, notes and events
          anytime.
        </li>
        <li>
          <strong>Bigger resets:</strong> Settings → Reset and delete can clear finished tasks,
          all tasks, your level and XP, or everything.
        </li>
        <li>
          <strong>Delete your account:</strong> Removes it and everything in it for good. There&apos;s
          no backup.
        </li>
        <li>
          <strong>Export first:</strong> Settings → Data &amp; export gives you everything as JSON,
          or one table at a time as CSV.
        </li>
      </ul>

      <h2>7. Security</h2>
      <ul>
        <li><strong>Passwords:</strong> Stored as scrambled hashes, never as plain text.</li>
        <li><strong>Sessions:</strong> Signed cookies that can&apos;t be faked or read by page scripts.</li>
        <li><strong>Sign-in limits:</strong> Too many tries in a row get slowed down.</li>
        <li>
          <strong>Your part:</strong> Use a password you don&apos;t use anywhere else. No system is
          perfect.
        </li>
      </ul>

      <h2>8. Kids under 13</h2>
      <p>
        Summit is made for students, but it&apos;s not for kids under 13. If you&apos;re under 13,
        please don&apos;t sign up. If a child under 13 made an account, email us (section 10) and
        we&apos;ll delete it. Parents and guardians can also ask to see, fix or delete their
        child&apos;s data.
      </p>

      <h2>9. Changes</h2>
      <p>
        If this policy changes, we&apos;ll post the new version here with a new date. If a change
        affects what we collect or who sees it, we&apos;ll tell you in the app too.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions, or want to see or delete your data? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Parents and guardians can use the
        same address.
      </p>
    </div>
  );
}
