/**
 * Bring an official contest into the site by pasting it.
 *
 * The AoPS wiki blocks automated fetching (backend/amc/official.py explains),
 * so the reader copies the page source and the answer key, and this parses
 * them: Preview shows what was found and anything missing, Save stores it for
 * every account on this install. After that the contest is practiced, graded
 * and timed here like the Step Mocks.
 */
import { useState } from 'react';
import { MathText } from './MathText';
import { amc, announceAmcChanged, type ImportPreview, type PastContest } from '@/services/amc';

export function Importer({ contest, onSaved }: { contest: PastContest; onSaved: () => void }) {
  const [problems, setProblems] = useState('');
  const [key, setKey] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const aime = contest.level === 'AIME';

  async function run(save: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.importContest(contest.id, problems, key, save);
      if (reply.success) {
        setPreview(reply);
        if (save) {
          announceAmcChanged();
          onSaved();
        }
      } else {
        setMessage(reply.message);
        if (reply.preview) setPreview(reply as unknown as ImportPreview);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }

  // Saveable once every problem and answer is there. Choices that could not be
  // split are a warning, not a blocker: the server stores the problem anyway.
  const ready = !!preview && (preview.complete ?? preview.issues.length === 0);

  return (
    <section className="am-card am-importer">
      <div className="am-card-head"><h2>Bring this contest into Summit</h2></div>
      <ol className="am-steps">
        <li>
          Open the{' '}
          <a className="am-link" href={contest.problems_url.replace('/wiki/index.php/', '/wiki/index.php?action=edit&title=')}
             target="_blank" rel="noreferrer">problems page source ↗</a>{' '}
          on the AoPS wiki, select all of it, copy, and paste it below. (Copying the problems from a PDF works too.)
        </li>
        <li>
          Do the same with the{' '}
          <a className="am-link" href={contest.answers_url} target="_blank" rel="noreferrer">answer key ↗</a>
          {aime ? ' — fifteen integers.' : ' — the letters, in any layout.'}
        </li>
        <li>Preview, check it, and save. From then on every account here can practice and time it in-site.</li>
      </ol>
      <div className="am-import-fields">
        <label className="am-field">
          <span>Problems</span>
          <textarea className="am-input am-import-text" value={problems} spellCheck={false}
                    placeholder={'==Problem 1==\n...'} onChange={(e) => { setProblems(e.target.value); setPreview(null); }} />
        </label>
        <label className="am-field">
          <span>Answer key</span>
          <textarea className="am-input am-import-key" value={key} spellCheck={false}
                    placeholder={aime ? '# 204\n# 033\n...' : '# B\n# D\n...'} onChange={(e) => { setKey(e.target.value); setPreview(null); }} />
        </label>
      </div>
      <div className="am-answer-bar">
        <span className="am-muted" style={{ fontSize: 12 }}>
          Problem text © the Mathematical Association of America. It is stored in this install's database only.
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="am-btn" disabled={busy || !problems.trim()} onClick={() => void run(false)}>
            Preview
          </button>
          <button type="button" className="am-btn am-btn-primary" disabled={busy || !ready} onClick={() => void run(true)}>
            Save contest
          </button>
        </div>
      </div>
      {message && <p className="am-error">{message}</p>}
      {preview && (
        <div className="am-import-preview">
          <p className={ready ? 'am-muted' : 'am-error'} style={{ fontSize: 13 }}>
            {preview.saved && 'Saved. '}
            {preview.issues.length
              ? preview.issues.join(' ')
              : `Found all ${preview.count} problems and answers${preview.diagrams ? `; ${preview.diagrams} have diagrams that can't be drawn here` : ''}.`}
          </p>
          {preview.preview.slice(0, 3).map((p) => (
            <div key={p.number} className="am-import-row">
              <strong>#{p.number}</strong>
              <div style={{ minWidth: 0 }}>
                <MathText text={p.statement} as="p" />
                {p.choices && (
                  <p className="am-muted" style={{ fontSize: 13 }}>
                    {p.choices.map((c, i) => (
                      <span key={i} style={{ marginRight: 12 }}>({'ABCDE'.charAt(i)}) <MathText text={c} /></span>
                    ))}
                  </p>
                )}
              </div>
              <span className="am-pill">{p.answer ?? '?'}</span>
            </div>
          ))}
          {preview.preview.length > 3 && (
            <p className="am-muted" style={{ fontSize: 12 }}>…and {preview.preview.length - 3} more.</p>
          )}
        </div>
      )}
    </section>
  );
}
