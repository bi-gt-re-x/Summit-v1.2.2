/**
 * Posts: AMC 10, AMC 12 and AIME problems and solutions posted by hand
 * (backend/api/amc_posts.py), saved to the database and shared by every
 * account.
 *
 * Write the way AoPS does: math in LaTeX between `$` signs, `$$...$$` or
 * `\[...\]` for a line of its own; `<math>` tags pasted from the wiki work
 * too. The preview beside the form draws it as the list will, in Computer
 * Modern (KaTeX's font, the one AoPS's LaTeX renders in), with the choices
 * laid out in one row like an AoPS problem page. Paste an AMC problem with its
 * choices line still in it and "Pull out the choices" fills the five boxes.
 *
 * Anyone signed in can post. Only the author (or an importer account) sees
 * Edit and Delete.
 */
import { useState } from 'react';
import { ErrorState, Loading } from '@/components';
import { Empty, PageHeader } from '@/components/Amc/bits';
import { MathText } from '@/components/Amc/MathText';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, type Level, type Post, type PostDraft } from '@/services/amc';
import '@/styles/amc.css';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const BLANK: PostDraft = { level: 'AMC 10', title: '', statement: '', choices: ['', '', '', '', ''], answer: '', solution: '' };

/** AoPS math markup into `$...$` / `$$...$$`, the same conversion the server makes on save. */
export function toDollars(text: string): string {
  return text
    .replace(/<cmath>([\s\S]*?)<\/cmath>/g, (_, m: string) => `$$${m.trim()}$$`)
    .replace(/<math>([\s\S]*?)<\/math>/g, (_, m: string) => `$${m.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => `$$${m.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
}

/** A choice written without `$` but full of TeX (`\frac12`) is math. */
export function choiceTex(text: string): string {
  const t = toDollars(text.trim());
  return !t.includes('$') && /[\\^_{}]/.test(t) ? `$${t}$` : t;
}

/** Text in paragraphs: a blank line starts a new one. */
function Paragraphs({ text }: { text: string }) {
  const parts = toDollars(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return <>{parts.map((p, i) => <MathText key={i} text={p} as="div" className="am-tex-p" />)}</>;
}

/** The problem as AoPS lays it out: the statement, then the choices in one row. */
function PostBody({ draft, reveal }: { draft: PostDraft; reveal: boolean }) {
  return (
    <div className="am-tex">
      <h3 className="am-tex-h">Problem</h3>
      {draft.statement.trim() ? <Paragraphs text={draft.statement} /> : <p className="am-muted">The problem will appear here.</p>}
      {draft.level !== 'AIME' && draft.choices && draft.choices.some((c) => c.trim()) && (
        <div className="am-tex-choices">
          {draft.choices.map((c, i) => (
            <span key={i} className={reveal && draft.answer === LETTERS[i] ? 'is-right' : ''}>
              <b>({LETTERS[i]})</b>&nbsp;<MathText text={choiceTex(c) || '…'} />
            </span>
          ))}
        </div>
      )}
      {reveal && (
        <>
          <h3 className="am-tex-h">Answer</h3>
          <p className="am-tex-answer">
            {draft.answer
              ? draft.level === 'AIME' ? <MathText text={`$\\boxed{${draft.answer.padStart(3, '0')}}$`} /> : `(${draft.answer})`
              : <span className="am-muted">Not set yet.</span>}
          </p>
          <h3 className="am-tex-h">Solution</h3>
          {draft.solution.trim() ? <Paragraphs text={draft.solution} /> : <p className="am-muted">No solution posted.</p>}
        </>
      )}
    </div>
  );
}

function Composer({ editing, onSaved, onCancel }: {
  editing: Post | null; onSaved: () => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PostDraft>(() => editing
    ? { level: editing.level, title: editing.title, statement: editing.statement,
        choices: editing.choices ?? ['', '', '', '', ''], answer: editing.answer, solution: editing.solution }
    : BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (patch: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const aime = draft.level === 'AIME';
  const choices = draft.choices ?? ['', '', '', '', ''];
  const canSplit = !aime && !choices.some((c) => c.trim()) && /\(\s*A\s*\)|\{\s*\(A\)/.test(draft.statement);

  async function split() {
    setMessage('');
    const reply = await amc.splitChoices(draft.statement);
    if (reply.success) set({ statement: reply.statement, choices: reply.choices });
    else setMessage(reply.message);
  }

  async function save() {
    setBusy(true);
    setMessage('');
    const body = { ...draft, choices: aime ? null : choices };
    try {
      const reply = editing ? await amc.editPost(editing.id, body) : await amc.createPost(body);
      if (reply.success) {
        setDraft(BLANK);
        onSaved();
      } else {
        setMessage(reply.message);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="am-post-compose">
      <section className="am-card">
        <div className="am-card-head"><h2>{editing ? 'Edit the problem' : 'Post a problem'}</h2></div>
        <div className="am-post-form">
          <div className="am-seg" role="group" aria-label="Contest">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={draft.level === l ? 'is-on' : ''}
                      onClick={() => set({ level: l, answer: l === 'AIME' || draft.level === 'AIME' ? '' : draft.answer })}>
                {l}
              </button>
            ))}
          </div>
          <label className="am-field">
            <span>Title <small className="am-muted">optional, e.g. 2024 AMC 10A Problem 12</small></span>
            <input className="am-input" value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="am-field">
            <span>Problem <small className="am-muted">LaTeX between $ signs; a blank line starts a paragraph</small></span>
            <textarea className="am-input am-code" rows={7} value={draft.statement}
                      placeholder={'What is the value of $\\frac{1}{2} + \\frac{1}{3}$?'}
                      onChange={(e) => set({ statement: e.target.value })} />
          </label>
          {!aime && (
            <div className="am-field">
              <span className="am-post-label">
                Answer choices <small className="am-muted">pick the right one</small>
                {canSplit && <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={() => void split()}>Pull out the choices</button>}
              </span>
              <div className="am-post-choices">
                {LETTERS.map((l, i) => (
                  <div key={l} className={`am-post-choice${draft.answer === l ? ' is-right' : ''}`}>
                    <button type="button" aria-pressed={draft.answer === l} aria-label={`${l} is the answer`}
                            onClick={() => set({ answer: l })}>{l}</button>
                    <input className="am-input am-code" value={choices[i]} placeholder={'$5$'} aria-label={`Choice ${l}`}
                           onChange={(e) => set({ choices: choices.map((c, j) => (j === i ? e.target.value : c)) })} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {aime && (
            <label className="am-field">
              <span>Answer <small className="am-muted">a whole number from 0 to 999</small></span>
              <input className="am-input" inputMode="numeric" value={draft.answer} style={{ maxWidth: 140 }}
                     onChange={(e) => set({ answer: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </label>
          )}
          <label className="am-field">
            <span>Solution</span>
            <textarea className="am-input am-code" rows={8} value={draft.solution}
                      placeholder={'Use a common denominator: $\\frac{3}{6} + \\frac{2}{6} = \\frac{5}{6}$.'}
                      onChange={(e) => set({ solution: e.target.value })} />
          </label>
          {message && <p className="am-error" style={{ margin: 0, fontSize: 13 }}>{message}</p>}
          <div className="am-post-actions">
            <button type="button" className="am-btn am-btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Post it'}
            </button>
            {editing && <button type="button" className="am-btn" onClick={onCancel}>Cancel</button>}
          </div>
        </div>
      </section>
      <section className="am-card am-post-preview" aria-label="Preview">
        <div className="am-card-head"><h2>Preview</h2><span className="am-muted" style={{ fontSize: 12 }}>as it will be posted</span></div>
        {draft.title && <p className="am-post-title">{draft.title}</p>}
        <PostBody draft={{ ...draft, choices }} reveal />
      </section>
    </div>
  );
}

function PostCard({ post, onEdit, onDeleted }: { post: Post; onEdit: () => void; onDeleted: () => void }) {
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState('');
  async function remove() {
    if (!window.confirm('Delete this problem for everyone? This cannot be undone.')) return;
    const reply = await amc.deletePost(post.id);
    if (reply.success) onDeleted(); else setMessage(reply.message);
  }
  return (
    <article className="am-card am-post">
      <header className="am-post-head">
        <div>
          <p className="am-post-title">{post.title || `${post.level} problem`}</p>
          <span className="am-muted" style={{ fontSize: 12 }}>
            {post.level} · posted by {post.author} · {post.created_at.slice(0, 10)}
            {post.updated_at !== post.created_at ? ' · edited' : ''}
          </span>
        </div>
        {post.can_edit && (
          <span className="am-post-tools">
            <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={onEdit}>Edit</button>
            <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={() => void remove()}>Delete</button>
          </span>
        )}
      </header>
      <PostBody draft={post as PostDraft} reveal={reveal} />
      <button type="button" className="am-btn am-btn-sm" style={{ marginTop: 14 }} onClick={() => setReveal((r) => !r)}>
        {reveal ? 'Hide the answer and solution' : 'Show the answer and solution'}
      </button>
      {message && <p className="am-error" style={{ fontSize: 13 }}>{message}</p>}
    </article>
  );
}

export default function Posts() {
  useDocumentTitle('Posted problems');
  const [level, setLevel] = useState<Level | ''>('');
  const [editing, setEditing] = useState<Post | null>(null);
  const [round, setRound] = useState(0);
  const { data, error, loading, reload } = useApi(() => amc.posts(level), [level, round]);
  const refresh = () => { setEditing(null); setRound((n) => n + 1); };

  return (
    <div className="amc-page">
      <PageHeader kicker="Temporary" title="Posted problems">
        <p>Post AMC 10, AMC 12 and AIME problems with their solutions. Write math in LaTeX between $ signs, as on AoPS; the preview shows exactly how it will look.</p>
      </PageHeader>

      <Composer key={editing?.id ?? 'new'} editing={editing} onSaved={refresh} onCancel={() => setEditing(null)} />

      <div className="am-post-listhead">
        <h2 className="am-h2">All posts{data ? ` (${data.posts.length})` : ''}</h2>
        <div className="am-seg" role="group" aria-label="Show">
          {(['', ...LEVELS] as (Level | '')[]).map((l) => (
            <button key={l || 'all'} type="button" className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)}>{l || 'All'}</button>
          ))}
        </div>
      </div>
      {loading && !data ? <Loading label="Loading posts" />
        : error || !data ? <ErrorState message={error ?? 'Could not load the posts.'} onRetry={reload} />
          : data.posts.length ? (
            <div className="am-stack">
              {data.posts.map((p) => (
                <PostCard key={p.id} post={p} onDeleted={refresh}
                          onEdit={() => { setEditing(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              ))}
            </div>
          ) : <Empty title="Nothing posted yet">Post the first problem above.</Empty>}
    </div>
  );
}
