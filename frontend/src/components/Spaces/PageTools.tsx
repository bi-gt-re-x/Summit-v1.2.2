/**
 * The page's own tools, beside its name: undo and redo, earlier versions, templates,
 * and export. Plus the strip of templates a blank page opens on.
 *
 * Undo and redo are the page's (pages/Space keeps the stacks, ⌘Z and ⇧⌘Z drive
 * them). Versions are the server's (backend/api/spaces.py "Version history"), so a
 * page wiped and saved can still be got back a day later.
 */
import { useEffect, useState } from 'react';
import { history as loadHistory, type Folder, type SpaceKind, type SpaceVersion } from '@/services/spaces';
import { useDismiss } from './useDismiss';
import { TEMPLATES, type Template } from './templates';

const REASON: Record<SpaceVersion['reason'], string> = {
  edit: 'Autosave',
  cut: 'Before a big delete',
  ai: 'Before the AI changed it',
  restore: 'Before a restore',
};

/** "Today 3:42 PM", "Yesterday 9:10 AM", "Nov 3, 9:10 AM". */
export function when(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const gap = Math.round((day(now) - day(at)) / 86_400_000);
  if (gap === 0) return `Today ${time}`;
  if (gap === 1) return `Yesterday ${time}`;
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

function HistoryPop({
  id,
  kind,
  onRestore,
  onClose,
}: {
  id: number;
  kind: SpaceKind;
  onRestore: (at: number) => Promise<string>;
  onClose: () => void;
}) {
  const ref = useDismiss(true, onClose);
  const [versions, setVersions] = useState<SpaceVersion[] | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void loadHistory(id, kind).then((result) => {
      if (!live) return;
      if (result.success) setVersions(result.versions);
      else setError(result.message || "Couldn't load the history.");
    });
    return () => {
      live = false;
    };
  }, [id, kind]);

  return (
    <div className="sp-pop sp-tools-pop sp-history" role="dialog" aria-label="Version history" ref={ref}>
      <p className="sp-pop-head">Version history</p>
      {error && <p className="sp-pop-error" role="alert">{error}</p>}
      {versions === null && !error && <p className="sp-tools-note">Loading…</p>}
      {versions?.length === 0 && (
        <p className="sp-tools-note">
          Nothing yet. Summit keeps a copy every 10 minutes of editing, and before any big delete.
        </p>
      )}
      <ol className="sp-versions">
        {(versions ?? []).map((version, at) => (
          <li key={version.at + at} className="sp-version">
            <div className="sp-version-head">
              <b>{when(version.at)}</b>
              <span className={`sp-version-why is-${version.reason}`}>{REASON[version.reason] ?? 'Autosave'}</span>
            </div>
            <p className="sp-version-meta">
              {version.words} {version.words === 1 ? 'word' : 'words'} · {version.blocks}{' '}
              {version.blocks === 1 ? 'block' : 'blocks'}
            </p>
            {version.preview.length > 0 && (
              <p className="sp-version-preview">{version.preview.join(' · ')}</p>
            )}
            {asking === at ? (
              <div className="sp-version-ask">
                <span>Your page now is kept too.</span>
                <button
                  type="button"
                  className="sp-ghost is-strong"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const problem = await onRestore(at);
                    setBusy(false);
                    if (problem) setError(problem);
                    else onClose();
                  }}
                >
                  {busy ? 'Restoring…' : 'Yes, restore'}
                </button>
                <button type="button" className="sp-ghost" onClick={() => setAsking(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="sp-ghost" onClick={() => setAsking(at)}>
                Restore this version
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function TemplatePop({ onPick, onClose }: { onPick: (template: Template) => void; onClose: () => void }) {
  const ref = useDismiss(true, onClose);
  return (
    <div className="sp-pop sp-tools-pop" role="menu" aria-label="Templates" ref={ref}>
      <p className="sp-pop-head">Add a template</p>
      <p className="sp-tools-note">It goes at the end of this page. ⌘Z takes it back out.</p>
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          role="menuitem"
          className="sp-pop-item sp-template-item"
          onClick={() => {
            onPick(template);
            onClose();
          }}
        >
          <span className="sp-pop-glyph" aria-hidden="true">{template.icon}</span>
          <span>
            <span className="sp-pop-label">{template.name}</span>
            <span className="sp-template-hint">{template.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ExportPop({ onMarkdown, onPrint, onClose }: { onMarkdown: () => void; onPrint: () => void; onClose: () => void }) {
  const ref = useDismiss(true, onClose);
  return (
    <div className="sp-pop sp-tools-pop" role="menu" aria-label="Export" ref={ref}>
      <button type="button" role="menuitem" className="sp-pop-item" onClick={() => { onMarkdown(); onClose(); }}>
        <span className="sp-pop-glyph" aria-hidden="true">⤓</span>
        <span className="sp-pop-label">Download as Markdown</span>
      </button>
      <button type="button" role="menuitem" className="sp-pop-item" onClick={() => { onClose(); onPrint(); }}>
        <span className="sp-pop-glyph" aria-hidden="true">⎙</span>
        <span className="sp-pop-label">Print or save as PDF</span>
      </button>
    </div>
  );
}

export function PageTools({
  id,
  kind,
  disabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRestore,
  onTemplate,
  onMarkdown,
  onPrint,
  folders = [],
  folder = '',
  onMove,
  onDelete,
  canDelete = true,
}: {
  id: number;
  kind: SpaceKind;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Put a version back. Resolves to an error to show, or ''. */
  onRestore: (at: number) => Promise<string>;
  onTemplate: (template: Template) => void;
  onMarkdown: () => void;
  onPrint: () => void;
  /** The kind's folders, and the one this page is filed under ('' for none). */
  folders?: Folder[];
  folder?: string;
  /** File the page under a folder. Resolves to an error to show, or ''. */
  onMove?: (folder: string) => Promise<string>;
  /** Delete the page. Resolves to an error to show, or ''. */
  onDelete?: () => Promise<string>;
  /** False on the last page of a kind, which can't go. */
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState<'' | 'history' | 'templates' | 'export' | 'page'>('');
  const toggle = (which: typeof open) => setOpen((was) => (was === which ? '' : which));
  return (
    <div className="sp-page-tools" role="toolbar" aria-label="Page tools">
      <button type="button" className="sp-ghost sp-tool" disabled={disabled || !canUndo} onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo">
        ↶
      </button>
      <button type="button" className="sp-ghost sp-tool" disabled={disabled || !canRedo} onClick={onRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
        ↷
      </button>
      <span className="sp-tools-wrap">
        <button type="button" className="sp-ghost" disabled={disabled} aria-expanded={open === 'history'} onClick={() => toggle('history')}>
          History
        </button>
        {open === 'history' && <HistoryPop id={id} kind={kind} onRestore={onRestore} onClose={() => setOpen('')} />}
      </span>
      <span className="sp-tools-wrap">
        <button type="button" className="sp-ghost" disabled={disabled} aria-expanded={open === 'templates'} onClick={() => toggle('templates')}>
          Templates
        </button>
        {open === 'templates' && <TemplatePop onPick={onTemplate} onClose={() => setOpen('')} />}
      </span>
      <span className="sp-tools-wrap">
        <button type="button" className="sp-ghost" disabled={disabled} aria-expanded={open === 'export'} onClick={() => toggle('export')}>
          Export
        </button>
        {open === 'export' && <ExportPop onMarkdown={onMarkdown} onPrint={onPrint} onClose={() => setOpen('')} />}
      </span>
      {(onMove || onDelete) && (
        <span className="sp-tools-wrap">
          <button type="button" className="sp-ghost" disabled={disabled} aria-expanded={open === 'page'} onClick={() => toggle('page')}>
            Page
          </button>
          {open === 'page' && (
            <PagePop folders={folders} folder={folder} onMove={onMove} onDelete={onDelete} canDelete={canDelete}
              onClose={() => setOpen('')} />
          )}
        </span>
      )}
    </div>
  );
}

/** The page itself: which folder it's in, and deleting it. */
function PagePop({ folders, folder, onMove, onDelete, canDelete, onClose }: {
  folders: Folder[];
  folder: string;
  onMove?: (folder: string) => Promise<string>;
  onDelete?: () => Promise<string>;
  canDelete: boolean;
  onClose: () => void;
}) {
  const ref = useDismiss(true, onClose);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<string>, close: boolean) => {
    setBusy(true);
    const problem = await action();
    setBusy(false);
    setError(problem);
    if (!problem && close) onClose();
  };
  return (
    <div className="sp-pop sp-tools-pop" role="dialog" aria-label="This page" ref={ref}>
      {onMove && (
        <>
          <p className="sp-pop-head">Folder</p>
          {folders.length === 0 ? (
            <p className="sp-tools-note">No folders yet. Add one with "New folder" in the rail.</p>
          ) : (
            <div className="sp-page-folders" role="radiogroup" aria-label="Folder">
              {[{ id: '', name: 'Not in a folder' }, ...folders].map((row) => (
                <button key={row.id || 'none'} type="button" role="radio" aria-checked={folder === row.id}
                  className={`sp-ghost sp-page-folder${folder === row.id ? ' is-on' : ''}`} disabled={busy}
                  onClick={() => void run(() => onMove(row.id), true)}>
                  {row.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {onDelete && (
        <>
          <p className="sp-pop-head">Delete</p>
          {!canDelete ? (
            <p className="sp-tools-note">This is the last page here, so it stays. Clear it instead.</p>
          ) : asking ? (
            <div className="sp-version-ask">
              <span>The page, its versions and its chat go for good.</span>
              <button type="button" className="sp-ghost is-strong" disabled={busy} onClick={() => void run(onDelete, false)}>
                {busy ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button type="button" className="sp-ghost" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="sp-ghost sp-page-delete" onClick={() => setAsking(true)}>Delete this page</button>
          )}
        </>
      )}
      {error && <p className="sp-pop-error" role="alert">{error}</p>}
    </div>
  );
}

/** What a blank page opens on: pick a start, or just type. */
export function TemplateStrip({ onPick }: { onPick: (template: Template) => void }) {
  return (
    <section className="sp-template-strip" aria-label="Start from a template">
      <p className="sp-template-title">Start from a template, or just start typing</p>
      <div className="sp-template-cards">
        {TEMPLATES.map((template) => (
          <button key={template.id} type="button" className="sp-template-card" onClick={() => onPick(template)}>
            <span className="sp-template-icon" aria-hidden="true">{template.icon}</span>
            <b>{template.name}</b>
            <span>{template.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
