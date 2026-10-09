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
        Welcome to Summit, a study and productivity tracker (&quot;the app&quot;, &quot;the
        service&quot;). By using Summit, you agree to these terms. If you do not agree,
        please do not use the app.
      </p>

      <h2>1. The Service</h2>
      <p>
        Summit provides tools for managing tasks, setting goals, scheduling work on a
        calendar, running focus sessions, and tracking your progress through streaks, XP,
        levels, and growth analytics. The service is provided free of charge — there are no
        paid tiers, subscriptions, or in-app purchases.
      </p>

      <h2>2. Your Account and Data</h2>
      <ul>
        <li>
          Your profile, tasks, goals, and progress data are stored locally on your device,
          as described in our <Link to="/privacy-policy">Privacy Policy</Link>.
        </li>
        <li>
          You are responsible for the content you enter into the app and for backing up your
          data if you wish to keep it.
        </li>
        <li>
          Because data is stored locally, clearing your browser storage or deleting the
          app&apos;s data files will permanently erase your progress.
        </li>
      </ul>

      <h2>3. Acceptable Use</h2>
      <p>You agree to use Summit only for lawful purposes. You may not:</p>
      <ul>
        <li>Attempt to disrupt, overload, or interfere with the operation of the service.</li>
        <li>
          Attempt to gain unauthorized access to data belonging to other users of the same
          installation.
        </li>
        <li>Use the app to store or distribute unlawful content.</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        The Summit name, design, and software are the property of the project&apos;s authors.
        The content you create in the app — your tasks, goals, and notes — remains yours.
      </p>

      <h2>5. Availability and Changes</h2>
      <p>
        Summit is under active development. Features may be added, changed, or removed at any
        time without notice. We do not guarantee that the service will be uninterrupted or
        error-free, or that your progress data (including XP, streaks, and levels) will
        always be preserved across updates.
      </p>

      <h2>6. Disclaimer of Warranties</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without
        warranties of any kind, express or implied, including fitness for a particular
        purpose. Productivity statistics, growth ratings, and analytics are provided for
        motivation and self-tracking only.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, the authors of Summit shall not be liable for
        any indirect, incidental, or consequential damages arising from your use of the app,
        including loss of data or loss of progress.
      </p>

      <h2>8. Changes to These Terms</h2>
      <p>
        We may update these terms from time to time. The current version will always be
        posted on this page with its effective date. Continued use of the app after changes
        take effect constitutes acceptance of the revised terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these terms? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}
