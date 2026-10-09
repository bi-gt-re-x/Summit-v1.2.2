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
        Summit (&quot;we&quot;, &quot;us&quot;, or &quot;the app&quot;) is a study and
        productivity tracker. This policy explains what the app collects, where it is
        kept, who else can see it, and what you can do about it. The short version: it is
        held on the server that runs Summit, it is not sold or shared for advertising, and
        you can export or delete all of it from Settings at any time.
      </p>

      <h2>1. Information We Collect</h2>
      <p>Things you give us when you make an account:</p>
      <ul>
        <li>
          <strong>Your e-mail address</strong> — used to confirm the account, to sign you
          in, and to send account e-mail. Nothing else is sent to it.
        </li>
        <li>
          <strong>Your name and username</strong> — the name greets you; the username is
          what everything you make is filed under.
        </li>
        <li>
          <strong>Your password</strong> — stored only as a pbkdf2 hash. It cannot be read
          back, by us or by anyone with the database.
        </li>
        <li>
          <strong>If you sign in with Google</strong> — we receive your e-mail address and
          name from Google to identify the account. We never receive your Google password.
        </li>
      </ul>
      <p>Things the app records as you use it:</p>
      <ul>
        <li>
          <strong>Tasks and goals</strong> — titles, descriptions, priorities, subjects,
          due dates, checkpoints, and the ratings you give a task when you finish it.
        </li>
        <li>
          <strong>Calendar entries</strong> — events and scheduled tasks you place on the
          calendar.
        </li>
        <li>
          <strong>Notes and records</strong> — anything you write on those pages.
        </li>
        <li>
          <strong>Activity metrics</strong> — focus session durations, tasks completed, XP
          events, and streaks. These are what the analytics pages are computed from.
        </li>
        <li>
          <strong>Preferences</strong> — theme, daily goal, start page, and the answers
          you give the analytics setup.
        </li>
      </ul>
      <p>
        We do not collect payment information, precise location, contacts, or advertising
        identifiers. Summit has no ads, no third-party analytics and no tracking pixels.
      </p>

      <h2>2. Where Your Data Is Kept</h2>
      <p>
        On the server running Summit, in a single database, sent to and from your browser
        over the network. It is <strong>not</strong> stored only on your device, and it is
        readable by whoever administers that server — which is the ordinary situation for
        a hosted application, and worth stating plainly rather than leaving you to assume
        otherwise.
      </p>
      <p>
        Your browser also keeps two cookies: a signed session cookie that says you are
        signed in, and a cookie remembering your chosen theme. The session cookie is the
        whole of your authorization, which is why it is marked Secure and HttpOnly and
        cannot be read by scripts on the page.
      </p>

      <h2>3. How We Use Your Information</h2>
      <p>Only to run the app for you:</p>
      <ul>
        <li>Displaying your tasks, goals, notes and calendar.</li>
        <li>Calculating streaks, XP, levels, growth ratings and recommendations.</li>
        <li>Sending account e-mail — verification, and nothing marketing.</li>
        <li>Remembering your preferences between sessions.</li>
      </ul>
      <p>We do not profile you for advertising, and we do not sell or rent anything.</p>

      <h2>4. Third Parties</h2>
      <p>There are two, and both only in specific circumstances:</p>
      <ul>
        <li>
          <strong>An AI provider, when you ask for a draft.</strong> The buttons that
          suggest checkpoints for a goal, steps for a checkpoint, or a goal for a subject
          send a short brief to an external model — the title, description and reason you
          wrote, the checkpoints you have already written, and summary counts such as how
          many tasks you finished and how many hours you logged. Depending on how this
          install is configured that provider is Anthropic or Hugging Face. Nothing is
          sent unless you press one of those buttons or create a checkpoint, and your
          e-mail address, password and notes are never included.
        </li>
        <li>
          <strong>Google, if you use &quot;Continue with Google&quot;.</strong> Standard
          OAuth: you sign in at Google, and Google tells us your e-mail and name.
        </li>
      </ul>
      <p>
        Fonts are loaded from Google Fonts, which means your browser makes a request to
        Google&apos;s servers for them. Beyond that, nothing about you is shared with
        anyone, and none of the above is advertising.
      </p>

      <h2>5. Comparison With Other Users</h2>
      <p>
        Summit does not rank you against other accounts. Every figure you are shown is
        worked out from your own record, and nobody else&apos;s record is read to produce
        it.
      </p>

      <h2>6. Data Retention and Deletion</h2>
      <p>
        Your data is kept until you remove it. Individual tasks, goals, notes and calendar
        entries can be deleted as you go. Settings → Reset and delete will clear your
        finished tasks, your whole task list, your level and XP, or everything you have
        made — and &quot;Delete this account&quot; removes the account and everything in
        it permanently. None of those can be undone and there is no backup, so Settings →
        Data &amp; export will give you the whole account as JSON, or a table at a time as
        CSV, first.
      </p>

      <h2>7. Security</h2>
      <p>
        Passwords are stored as pbkdf2 hashes and never in readable form. Sessions are
        signed cookies that cannot be forged or read by page scripts. Sign-in attempts are
        rate limited. Your data is only as safe as the server it is on, so it should be
        served over HTTPS and kept up to date — and no system is perfect: please use a
        password you do not use anywhere else.
      </p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>
        Summit is built for students, and much of its audience is at school. It is not
        directed at children under 13, and accounts should not be created for them. If you
        are under 13, please do not sign up; if you believe a child under 13 has created an
        account, contact us using the details in section 10 and we will delete it and its
        data. Depending on where you are, a parent or guardian may have the right to see,
        correct or delete what is held about their child — the same contact reaches us for
        that.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        If this policy changes, the updated version will be posted on this page with a new
        effective date. Where a change materially affects what is collected or who it is
        shared with, we will say so in the app rather than relying on you to re-read this
        page.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about this policy, or a request to see or delete what is held about you,
        go to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. A parent or guardian
        asking about their child&apos;s account can use the same address.
      </p>
    </div>
  );
}
