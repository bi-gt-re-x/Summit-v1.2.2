/**
 * The shell the Terms of Service and the Privacy Policy are drawn in: a title,
 * the effective date, a short summary, a table of contents that jumps to each
 * numbered section, and the sections themselves.
 *
 * The words live in the two pages as data (pages/TermsOfService.tsx,
 * pages/PrivacyPolicy.tsx), so a legal edit is an edit to sentences and never
 * to markup. The card and type are styles/content-page.css.
 */
import type { ReactNode } from 'react';
import { useDocumentTitle, usePageEntrance } from '@/hooks';
import '@/styles/content-page.css';

/** A paragraph, a bulleted list, or a smaller heading inside a section. */
export type LegalBlock = ReactNode | { list: ReactNode[] } | { sub: string };

export interface LegalSection {
  id: string;
  title: string;
  body: LegalBlock[];
}

function isList(block: LegalBlock): block is { list: ReactNode[] } {
  return typeof block === 'object' && block !== null && 'list' in block;
}

function isSub(block: LegalBlock): block is { sub: string } {
  return typeof block === 'object' && block !== null && 'sub' in block;
}

export function LegalDocument({
  title,
  effective,
  intro,
  summary,
  sections,
}: {
  title: string;
  effective: string;
  intro: ReactNode[];
  summary: ReactNode[];
  sections: LegalSection[];
}) {
  useDocumentTitle(title);
  /* The arrival cascade. Nothing is fetched here, so the page is ready the
     moment it mounts — see hooks/usePageEntrance. */
  const entering = usePageEntrance(true);

  return (
    <div className={`content-container legal-doc${entering ? ' pg-enter' : ''}`}>
      <h1>{title}</h1>
      <p className="effective-date">Effective date: {effective}</p>

      {intro.map((text, n) => (
        <p key={n}>{text}</p>
      ))}

      <aside className="legal-summary" aria-label="The short version">
        <h2>The short version</h2>
        <ul>
          {summary.map((text, n) => (
            <li key={n}>{text}</li>
          ))}
        </ul>
        <p className="legal-summary-note">
          This summary is here to help. The full text below is what applies.
        </p>
      </aside>

      <nav className="legal-toc" aria-label="Contents">
        <h2>Contents</h2>
        <ol>
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, n) => (
        <section key={section.id} id={section.id} className="legal-section">
          <h2>
            {n + 1}. {section.title}
          </h2>
          {section.body.map((block, k) =>
            isList(block) ? (
              <ul key={k}>
                {block.list.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : isSub(block) ? (
              <h3 key={k}>{block.sub}</h3>
            ) : (
              <p key={k}>{block}</p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}
