/**
 * Bring many official papers in at once.
 *
 * The AoPS wiki answers browsers but not servers (backend/amc/official.py
 * explains), so the reader's browser does the fetching: each batch link opens
 * one AoPS API page holding the wiki source of a few contests' problems and
 * answer keys. Select all, copy, paste here (several batches can go in one
 * paste), check, save. Every paper that comes through whole is stored for
 * every account on this install.
 */
import { useState } from 'react';
import { useApi } from '@/hooks';
import { amc, announceAmcChanged, type BundleRow } from '@/services/amc';

export function BulkImporter({ onSaved }: { onSaved: () => void }) {
  const { data, reload } = useApi(() => amc.importBatches(), []);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BundleRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  async function run(save: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.importBundle(text, save);
      if (!reply.success) {
        setMessage(reply.message);
        setRows(null);
        return;
      }
      setRows(reply.contests);
      if (save) {
        setMessage(`Saved ${reply.saved} paper${reply.saved === 1 ? '' : 's'}.`);
        setText('');
        announceAmcChanged();
        reload();
        onSaved();
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }

  const complete = rows?.filter((r) => r.complete && !r.saved).length ?? 0;
  const batches = data?.batches ?? [];
  const shown = open ? batches : batches.slice(0, 4);

  return (
    <section className="am-card am-importer">
      <div className="am-card-head">
        <h2>Import many papers</h2>
        {data && <span className="am-muted" style={{ fontSize: 13 }}>{data.total - data.missing} of {data.total} in</span>}
      </div>
      {data && data.missing === 0 ? (
        <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>Every paper is imported.</p>
      ) : (
        <>
          <ol className="am-steps">
            <li>Open a batch below. Each one is a page of AoPS wiki source for up to eight papers.</li>
            <li>Select all of it, copy, and paste it here. You can paste several batches together.</li>
            <li>Check it, then save. Complete papers are stored. Any with problems missing are listed below.</li>
          </ol>
          <ul className="am-batch-list">
            {shown.map((b, i) => (
              <li key={b.url}>
                <a className="am-link" href={b.url} target="_blank" rel="noreferrer">Batch {i + 1} ↗</a>
                <span className="am-muted">{b.label}</span>
              </li>
            ))}
          </ul>
          {batches.length > 4 && (
            <button type="button" className="am-link am-link-button" style={{ fontSize: 13 }} onClick={() => setOpen(!open)}>
              {open ? 'Fewer batches' : `All ${batches.length} batches`}
            </button>
          )}
          <label className="am-field" style={{ marginTop: 12 }}>
            <span>Pasted batches</span>
            <textarea className="am-input am-import-text" value={text} spellCheck={false}
                      placeholder={'{"batchcomplete":true,"query":{"pages":[...]}}'}
                      onChange={(e) => { setText(e.target.value); setRows(null); }} />
          </label>
          <div className="am-answer-bar">
            <span className="am-muted" style={{ fontSize: 12 }}>
              Problem text © the Mathematical Association of America. It is stored in this install's database only.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="am-btn" disabled={busy || !text.trim()} onClick={() => void run(false)}>
                Check
              </button>
              <button type="button" className="am-btn am-btn-primary" disabled={busy || !complete} onClick={() => void run(true)}>
                Save {complete ? complete : ''} paper{complete === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </>
      )}
      {message && <p className={rows ? 'am-muted' : 'am-error'} style={{ fontSize: 13 }}>{message}</p>}
      {rows && (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Paper</th><th className="num">Problems</th><th className="num">Answers</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="num">{r.problems}/{r.count}</td>
                  <td className="num">{r.answers}/{r.count}</td>
                  <td className={r.complete ? 'am-muted' : 'am-error'} style={{ fontSize: 12 }}>
                    {r.saved ? 'Saved' : r.complete ? 'Ready' : r.issues.join(' ')}
                    {r.complete && r.issues.length > 0 && <span className="am-muted"> ({r.issues.join(' ')})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
