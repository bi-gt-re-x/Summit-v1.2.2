/**
 * The privacy policy.
 *
 * ## It says what the code does
 *
 * An earlier version said data stayed in the browser, which stopped being
 * true when Summit moved to a server; a later one said notes never went to an
 * AI provider, which stopped being true when task notes and the Log started
 * feeding the prompts. A policy that is wrong in the reader's favor is worse
 * than none. So each section is checkable against the code, and if one of
 * these changes, this page changes with it:
 *
 *   account, email, verification   backend/routes/auth.py, tracking/auth.py
 *   what's stored, and where       backend/database/schema.sql, connection.py
 *   what goes to AI providers      tracking/planner.py (providers), subject_ai.py
 *                                  and next_sessions.py (task titles, ratings,
 *                                  first 160 characters of task notes),
 *                                  journal.py (Log entries, read after saving),
 *                                  background.py (About you answers)
 *   sensitive-topic filter         `sensitive` in tracking/journal.py
 *   scheduling from your habits    tracking/session_timing.py
 *   IP addresses                   middleware/limit.py (memory only)
 *   cookies                        main.py (session, 14 days), routes/theme.py
 *   deletion and export            the Reset and delete and Data sections of Settings
 *
 * **It is a careful draft, not legal advice**, and should be read by a lawyer
 * before Summit is offered widely. The contact address is utils/contact.ts.
 *
 * The words are data; LegalDocument draws them.
 */
import { Link } from 'react-router-dom';
import { LegalDocument, type LegalSection } from '@/components/LegalDocument';
import { CONTACT_EMAIL } from '@/utils/contact';
import { RULES } from '@/utils/sharedRules';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
const terms = <Link to="/terms-of-service">Terms of Service</Link>;
const FEELING_DAYS = RULES.log.feeling_days;

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    title: 'Who we are and what this covers',
    body: [
      <>
        Summit ("we", "us" or "our") is a study and productivity tracker. This Privacy Policy
        explains what personal information we collect when you use the Summit website and web
        app (the "Service"), how we use it, who we share it with, how long we keep it, and the
        choices and rights you have. It's part of our {terms}.
      </>,
      <>
        For the purposes of data protection laws such as the GDPR, Summit is the "controller" of
        your personal information. You can reach us at {mail}.
      </>,
    ],
  },
  {
    id: 'you-give',
    title: 'Information you give us',
    body: [
      { sub: 'When you make an account' },
      {
        list: [
          <><strong>Name and email address.</strong> Your email confirms your account, lets you sign in and receives account emails. Your name is used to greet you.</>,
          <><strong>Username.</strong> You pick it when you finish setting up. It's how your account is known inside Summit and is never shown to other users.</>,
          <><strong>Password.</strong> Stored only as a salted, one-way hash (PBKDF2-SHA256). Nobody, including us, can read your password from it.</>,
          <><strong>Google sign-in.</strong> If you choose "Continue with Google", Google sends us your name and email address and confirms the address is yours. We never see your Google password.</>,
          <><strong>About you.</strong> The optional answers you give during setup and in Settings, such as what you study, your goals, and how you like to work.</>,
        ],
      },
      { sub: 'As you use Summit' },
      {
        list: [
          <><strong>Tasks:</strong> titles, notes, subjects, due dates and times, how hard each was, how it went, the reasons you pick, and the XP they're worth.</>,
          <><strong>Goals and checkpoints,</strong> including the scores and progress you log.</>,
          <><strong>Calendar:</strong> events, times and the daily focus notes you write.</>,
          <><strong>Focus timer:</strong> each sitting's length, breaks, the task it was for and what you meant to get done.</>,
          <><strong>Notes, Spaces and links</strong> you save, including any outside resources you keep.</>,
          <><strong>The Log:</strong> your journal entries, and the short insights Summit learns from them (see section 6).</>,
          <><strong>Recommendations</strong> we suggested, and whether you planned or finished them.</>,
          <><strong>Settings and preferences,</strong> such as your theme, start page, daily goal and notification choices.</>,
          <><strong>Messages you send us,</strong> such as support emails.</>,
        ],
      },
      'We don\'t ask for and don\'t want payment details, government ID numbers, your precise location, your contacts, or information about your health, religion, politics, sexuality or ethnicity. Please don\'t put that kind of information into Summit.',
    ],
  },
  {
    id: 'automatic',
    title: 'Information collected automatically',
    body: [
      {
        list: [
          <><strong>Activity we work out from your data.</strong> Streaks, XP, levels, achievements, analytics, focus totals, the times of day and days of the week you usually work, and how well work goes at those times. These are calculated from what you've entered and stored with your account.</>,
          <><strong>IP address.</strong> Used briefly, in the server's memory only, to slow down repeated sign-in attempts, sign-ups and other requests that could be abused. It isn't saved to our database.</>,
          <><strong>Technical logs.</strong> Like any web server, ours may briefly record requests and errors (such as the page asked for and the time) to keep the Service working and secure.</>,
          <><strong>Cookies and browser storage.</strong> Described in section 9.</>,
        ],
      },
      'We don\'t use advertising networks, analytics trackers, tracking pixels, fingerprinting or third-party cookies.',
    ],
  },
  {
    id: 'use',
    title: 'How we use your information',
    body: [
      'We use your information only to run Summit for you:',
      {
        list: [
          'To create and secure your account, confirm your email and sign you in.',
          'To store and show your tasks, goals, calendar, notes, Spaces and Log.',
          'To work out your streaks, XP, levels, achievements and analytics.',
          'To personalize suggestions, such as recommended study sessions and free resources, and to schedule planned sessions at the times your own history shows you work best, spaced apart from your other sessions.',
          'To send account emails, such as the link that confirms your address.',
          'To protect the Service and its users, including limiting abuse, investigating problems and enforcing our Terms.',
          'To fix bugs and improve how Summit works.',
          'To meet legal obligations.',
        ],
      },
      { sub: 'What we never do' },
      {
        list: [
          'We never sell or rent your personal information, and we never "share" it for cross-context behavioral advertising.',
          'We never show you ads or use your data to target ads anywhere else.',
          'We never compare or rank you against other users. Every number you see comes from your own work.',
          'We never send marketing email.',
          'We don\'t use your content to train our own AI models.',
        ],
      },
    ],
  },
  {
    id: 'legal-bases',
    title: 'Legal bases (EEA, UK and similar laws)',
    body: [
      'If you live in the European Economic Area, the United Kingdom or another place with similar laws, we rely on these legal bases:',
      {
        list: [
          <><strong>Contract:</strong> to provide the Service you signed up for, including your account, your content and the features you use.</>,
          <><strong>Legitimate interests:</strong> to keep the Service secure, prevent abuse, fix problems and improve it, in ways that don't override your rights.</>,
          <><strong>Consent:</strong> for optional things you choose, such as signing in with Google, sharing About you answers, and using the Log's learning. You can withdraw consent at any time by removing that information or not using the feature.</>,
          <><strong>Legal obligation:</strong> when the law requires us to keep or disclose information.</>,
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI features and what they receive',
    body: [
      'Some features send a summary of your records to an outside AI provider, which writes a response that we show to you. Depending on how Summit is set up, the provider is Groq, Hugging Face, xAI (Grok) or Anthropic. Each processes the request under its own API terms and privacy policy.',
      { sub: 'When it happens' },
      {
        list: [
          <><strong>When you press a button</strong> that drafts checkpoints, a goal plan, recommended sessions, a reading of a subject or similar.</>,
          <><strong>After you save a Log entry.</strong> A model reads the entry in the background, about {RULES.log.quiet_seconds} seconds after you stop typing or right away when you press Save, and turns it into a few short insights.</>,
        ],
      },
      { sub: 'What it can include' },
      {
        list: [
          'Your goal text, checkpoint names and progress.',
          'Recent task titles, their subjects, dates, how hard they were, how they went, the reasons you picked, how long they took, and the first 160 characters of each task\'s notes.',
          'Counts and averages worked out from your tasks.',
          'Your About you answers and the insights learned from your Log.',
          'For the Log, the text of the entry being read.',
          'Links you keep for a subject.',
        ],
      },
      { sub: 'What it never includes' },
      {
        list: [
          'Your email address, password, name, username or IP address.',
          'Other people\'s data.',
        ],
      },
      { sub: 'Limits on what the Log learns' },
      <>
        The Log is told never to infer anything about health, sexuality, gender identity,
        religion, politics or ethnicity, and Summit throws away any insight that touches those
        topics anyway. Insights about how you felt fade after {FEELING_DAYS} days and are never
        treated as lasting facts. You can see every insight on the Log page and remove any of
        them, and Summit won't learn a removed one again.
      </>,
      'If you don\'t want your information sent to an AI provider, don\'t use the AI buttons and don\'t write in the Log. Everything else in Summit works without them.',
    ],
  },
  {
    id: 'sharing',
    title: 'Who we share information with',
    body: [
      'We share personal information only with these service providers, only as much as each needs, and only to run Summit:',
      {
        list: [
          <><strong>AI providers</strong> (Groq, Hugging Face, xAI, Anthropic), as described in section 6.</>,
          <><strong>Google,</strong> if you sign in with Google; to deliver our emails, which are sent through Gmail; and to load the fonts the site uses from Google Fonts, which means your browser asks Google's servers for them and Google sees your IP address.</>,
          <><strong>Hosting and database providers</strong> that run the servers Summit is stored on.</>,
        ],
      },
      'We may also disclose information if the law requires it (for example a valid court order), to protect the safety, rights or property of our users, the public or Summit, or as part of a merger, sale or reorganization, in which case this policy will continue to protect your information.',
      'Other Summit users can\'t see your account or your content.',
    ],
  },
  {
    id: 'email',
    title: 'Emails we send',
    body: [
      'We email you only about your account: today, that means the link that confirms your email address, and a new one if you ask us to send it again. Our emails come from joverdam722@gmail.com and are sent through Gmail.',
      'We never send marketing email, we never sell or share your address, and we will never ask for your password by email. If you get an email claiming to be from Summit that asks for your password, don\'t answer it, and let us know.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: [
      'Summit uses only what it needs to work:',
      {
        list: [
          <><strong>Sign-in cookie.</strong> Keeps you signed in for up to 14 days. It's signed so it can't be forged, marked HttpOnly so page scripts can't read it, sent only over secure connections when the site is served over HTTPS, and limited to Summit (SameSite=Lax).</>,
          <><strong>Theme cookie.</strong> Remembers light or dark mode so the page doesn't flash the wrong colors.</>,
          <><strong>Browser storage.</strong> Your browser keeps small conveniences on your device, such as a running focus timer, which tab or view you last had open, and drafts you haven't saved. It stays on your device, and clearing your browser's site data removes it.</>,
        ],
      },
      'We don\'t use advertising or analytics cookies, so there is nothing to opt out of. Because we don\'t track you across sites, we treat every visitor as if they had sent a "Do Not Track" or Global Privacy Control signal.',
    ],
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: [
      {
        list: [
          <><strong>Your account and content</strong> are kept until you delete them or your account.</>,
          <><strong>Deleting your account</strong> (Settings, Reset and delete) removes it and everything in it from our live database right away. We don't keep a separate backup of deleted accounts.</>,
          <><strong>Smaller resets</strong> in Settings can clear finished tasks, all tasks, your level and XP, or all your content while keeping the account.</>,
          <><strong>Email confirmation links</strong> stop working once used, and a new one replaces the old.</>,
          <><strong>Log feelings</strong> fade after {FEELING_DAYS} days, as section 6 explains.</>,
          <><strong>Technical logs</strong> are kept only as long as needed to run and secure the Service.</>,
          <><strong>Unconfirmed or long-inactive accounts</strong> may be deleted, as our {terms} describe.</>,
        ],
      },
      'We may keep information longer only where the law requires it, or to deal with a dispute or abuse.',
    ],
  },
  {
    id: 'security',
    title: 'How we protect information',
    body: [
      {
        list: [
          'Passwords are stored only as salted, one-way hashes, never as plain text.',
          'New passwords must meet minimum strength rules.',
          'Sign-in sessions use signed, HttpOnly cookies.',
          'Repeated sign-in attempts, sign-ups, email requests and checks are rate limited.',
          'Each account can reach only its own data, and every request is checked for that.',
          'Access to the servers and database is limited to the people who run Summit.',
        ],
      },
      'No system is perfectly secure, so we can\'t promise that information will never be accessed without permission. If a breach affects your personal information, we will tell you and any authorities as the law requires. You can help by using a password you don\'t use anywhere else.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights and choices',
    body: [
      'Wherever you live, you can:',
      {
        list: [
          <><strong>See and export</strong> your data: Settings, Data &amp; export, gives you everything as JSON, or one table at a time as CSV.</>,
          <><strong>Correct</strong> it: edit your name, tasks, goals and everything else in the app. Email us to change anything you can't edit yourself.</>,
          <><strong>Delete</strong> it: remove single items, use the resets in Settings, or delete your whole account.</>,
          <><strong>Remove what the Log learned</strong> about you, one insight at a time.</>,
          <><strong>Ask us</strong> anything about your data, or for help with any of the above, at {mail}.</>,
        ],
      },
      { sub: 'EEA, UK and similar laws' },
      'You also have the right to access, correct, delete, restrict or object to our use of your personal information, to receive it in a portable format, and to withdraw consent at any time. You can complain to your local data protection authority, though we\'d like the chance to fix the problem first.',
      { sub: 'California and other US states' },
      'Depending on your state, you have the right to know what personal information we collect and how we use it, to access, correct and delete it, and to opt out of its sale or sharing for targeted advertising. We don\'t sell or share personal information for advertising, and we don\'t use it to make decisions with legal or similarly significant effects about you. We will never treat you differently for using your rights.',
      { sub: 'How to make a request' },
      'Email us from the address on your account so we can confirm it\'s you. We will answer within 30 days (or sooner if your local law requires it). A parent or guardian, or someone you authorize, can make a request for you, and we may ask them to show that they are allowed to.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    body: [
      'Summit is built for students, but it isn\'t for children under 13. Everyone must confirm they are 13 or older to sign up, and we don\'t knowingly collect personal information from children under 13. Users under 18 need a parent or guardian\'s permission.',
      <>
        If you believe a child under 13 has made an account, email {mail} and we will delete it.
        Parents and guardians of users under 18 can also ask to see, correct or delete their
        child's information.
      </>,
    ],
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: [
      'Summit\'s servers and the providers listed in section 7 may be in a different country from you, including the United States. When we move personal information from the EEA, the UK or Switzerland to another country, we rely on the safeguards the law allows, such as the European Commission\'s Standard Contractual Clauses in our providers\' terms.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: [
      'We will post any change to this policy on this page with a new effective date. If a change affects what we collect, how we use it or who we share it with, we will tell you in the app before it takes effect, and where the law requires it, we will ask for your consent.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [
      <>
        Questions, requests or complaints about privacy? Email {mail}. Parents and guardians can
        use the same address.
      </>,
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effective="October 17, 2026"
      intro={[
        'Your privacy matters to us. This policy explains what Summit collects, why, who sees it, and what you can do about it, in as plain words as we can manage.',
      ]}
      summary={[
        'We collect what you put into Summit, plus your name, email and a hashed password.',
        'We use it only to run Summit for you. No ads, no selling, no tracking across sites.',
        'Some features send a summary of your tasks, or a Log entry, to an AI provider. Never your email or password.',
        'Only you can see your data. We never compare you with other people.',
        'Export or delete everything from Settings, any time.',
        'Summit is for people 13 and older.',
      ]}
      sections={SECTIONS}
    />
  );
}
