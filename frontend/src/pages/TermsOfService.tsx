/**
 * The terms of service.
 *
 * Ported from the terms-of-service.html template, word for word, for the same
 * reason the privacy policy is: published terms are not a port's to reword.
 *
 * The one link inside the prose pointed at the privacy policy through Jinja's
 * `url_for`; it is a router <Link> now, so following it does not reload the
 * app. See PrivacyPolicy.tsx for the rest of the shared reasoning.
 */
import { Link } from 'react-router-dom';
import { useDocumentTitle, usePageEntrance } from '@/hooks';
import { CONTACT_EMAIL } from '@/utils/contact';
import '@/styles/content-page.css';

export default function TermsOfService() {
  useDocumentTitle('Terms of Service');

  /* The arrival cascade. Nothing is fetched here, so the page is ready the
     moment it mounts — see hooks/usePageEntrance. */
  const entering = usePageEntrance(true);

  return (
    <div className={`content-container${entering ? ' pg-enter' : ''}`}>
      <h1>Terms of Service</h1>
      <p className="effective-date">Effective date: July 22, 2026</p>

      <p>
        Welcome to Summit, a study and productivity tracker (&quot;the app&quot;). By using it, you
        agree to these terms. If you don&apos;t agree, please don&apos;t use the app.
      </p>

      <h2>1. What Summit is</h2>
      <p>
        Summit helps you manage tasks, set goals, plan your calendar, run focus sessions and
        track your progress with streaks, XP, levels and analytics. It&apos;s free. No paid plans,
        no subscriptions and no in-app purchases.
      </p>

      <h2>2. Your account and data</h2>
      <ul>
        <li>
          <strong>Where it lives:</strong> Your data is saved on the server that runs Summit. Our{' '}
          <Link to="/privacy-policy">Privacy Policy</Link> has the details.
        </li>
        <li>
          <strong>Your stuff, your call:</strong> You&apos;re responsible for what you put in the app.
          Export a backup from Settings if you want to keep a copy.
        </li>
        <li>
          <strong>Deleting is final:</strong> If you delete your account or reset your data,
          it&apos;s gone for good.
        </li>
      </ul>

      <h2>3. Play fair</h2>
      <p>Use Summit for legal stuff only. Please don&apos;t:</p>
      <ul>
        <li>Try to crash, overload or break the app.</li>
        <li>Try to get into anyone else&apos;s account or data.</li>
        <li>Store or share anything illegal.</li>
      </ul>

      <h2>4. Who owns what</h2>
      <p>
        The Summit name, design and code belong to the people who made it. Everything you
        create, like your tasks, goals and notes, belongs to you.
      </p>

      <h2>5. Things may change</h2>
      <p>
        Summit is still being built. Features may be added, changed or removed without notice.
        We can&apos;t promise it&apos;ll never go down or have bugs, or that your XP, streaks and
        levels will always carry over after updates.
      </p>

      <h2>6. No guarantees</h2>
      <p>
        Summit is provided &quot;as is&quot; and &quot;as available,&quot; with no warranties of any
        kind. Your stats, scores and analytics are there to motivate you and help you track
        yourself. They aren&apos;t official grades of anything.
      </p>

      <h2>7. Limits on liability</h2>
      <p>
        As far as the law allows, Summit&apos;s makers aren&apos;t responsible for indirect or
        accidental damages from using the app, including lost data or lost progress.
      </p>

      <h2>8. Changes to these terms</h2>
      <p>
        We may update these terms now and then. The latest version will always be on this page
        with its date. If you keep using Summit after a change, that means you accept the new
        terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these terms? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}
