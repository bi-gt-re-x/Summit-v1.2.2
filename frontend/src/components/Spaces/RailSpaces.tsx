/**
 * One kind's pages in the rail: Personal or Team.
 *
 * Pages that aren't in a folder come first, then each folder with its pages
 * under it, folded or open (remembered on this device). Below them, a row to add
 * a page and one to add a folder. A folder's "⋯" adds a page straight into it,
 * renames it or deletes it; deleting a folder keeps its pages, out of any folder.
 * Moving a page into a folder, or deleting it, is on the page itself
 * (components/Spaces/PageTools). Backend: backend/api/spaces.py.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FOLDERS_MAX,
  SPACE_MAX,
  SPACE_PATH,
  addFolder,
  create,
  removeFolder,
  renameFolder,
  type Folder,
  type Space,
  type SpaceKind,
} from '@/services/spaces';

const OPEN_KEY = (kind: SpaceKind) => `summit:space-folders-open:${kind}`;

function readOpen(kind: SpaceKind): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_KEY(kind)) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const FOLDER_ICON = icon(<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />);
const PLUS_ICON = icon(<path d="M12 5v14M5 12h14" />);

export interface RailSpacesProps {
  kind: SpaceKind;
  spaces: Space[];
  folders: Folder[];
  /** The icon for a page with no emoji of its own. */
  pageIcon: ReactNode;
}

export function RailSpaces({ kind, spaces, folders, pageIcon }: RailSpacesProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpen(kind));
  const [naming, setNaming] = useState<null | { folder: string | null; text: string }>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const base = SPACE_PATH[kind];

  const flip = (id: string) => setOpen((was) => {
    const next = { ...was, [id]: !(was[id] ?? true) };
    try {
      localStorage.setItem(OPEN_KEY(kind), JSON.stringify(next));
    } catch {
      /* private mode: it folds for this visit */
    }
    return next;
  });

  const say = (result: { success: boolean; message?: string }) => {
    setProblem(result.success ? null : result.message || "That didn't save. Try it again.");
    return result.success;
  };

  const newPage = async (folder = '') => {
    setMenu(null);
    try {
      const result = await create(kind, { folder });
      if (!say(result) || !result.success) return;
      if (folder) setOpen((was) => ({ ...was, [folder]: true }));
      navigate(`${base}/${result.space.id}`);
    } catch {
      setProblem("Couldn't reach the server.");
    }
  };

  const finishNaming = async () => {
    if (!naming) return;
    const text = naming.text.trim();
    const editing = naming.folder;
    setNaming(null);
    if (!text) return;
    const result = await (editing ? renameFolder(kind, editing, text) : addFolder(kind, text))
      .catch(() => ({ success: false as const, message: "Couldn't reach the server." }));
    say(result);
  };

  const dropFolder = async (folder: Folder) => {
    setMenu(null);
    say(await removeFolder(kind, folder.id).catch(() => ({ success: false as const, message: "Couldn't reach the server." })));
  };

  const page = (space: Space, nested = false) => (
    <NavLink
      key={space.id}
      to={`${base}/${space.id}`}
      className={({ isActive }) => `rail-link${nested ? ' rail-nested' : ''}${isActive ? ' active' : ''}`}
      title={space.name}
    >
      {space.doc?.icon ? <i className="rail-emoji" aria-hidden="true">{space.doc.icon}</i> : pageIcon}
      <span>{space.name}</span>
    </NavLink>
  );

  const loose = spaces.filter((space) => !space.folder);
  const full = spaces.length >= SPACE_MAX;

  return (
    <>
      {loose.map((space) => page(space))}

      {folders.map((folder) => {
        const inside = spaces.filter((space) => space.folder === folder.id);
        const shown = open[folder.id] ?? true;
        if (naming?.folder === folder.id) {
          return <NameField key={folder.id} value={naming.text} label="Folder name"
            onChange={(text) => setNaming({ folder: folder.id, text })} onDone={() => void finishNaming()}
            onCancel={() => setNaming(null)} />;
        }
        return (
          <div key={folder.id} className={`rail-folder${shown ? ' is-open' : ''}`}>
            <div className="rail-folder-head">
              <button type="button" className="rail-link rail-folder-name" aria-expanded={shown}
                onClick={() => flip(folder.id)} title={folder.name}
                aria-label={`${folder.name}, ${inside.length === 1 ? '1 page' : `${inside.length} pages`}`}>
                {FOLDER_ICON}
                <span>{folder.name}</span>
                <small className="rail-folder-count">{inside.length}</small>
              </button>
              <span className="rail-folder-tools">
                <button type="button" className="rail-folder-more" aria-label={`${folder.name} options`}
                  aria-expanded={menu === folder.id} onClick={() => setMenu(menu === folder.id ? null : folder.id)}>
                  ⋯
                </button>
                {menu === folder.id && (
                  <FolderMenu
                    onClose={() => setMenu(null)}
                    items={[
                      ...(full ? [] : [{ label: 'New page here', run: () => void newPage(folder.id) }]),
                      { label: 'Rename', run: () => { setMenu(null); setNaming({ folder: folder.id, text: folder.name }); } },
                      { label: 'Delete folder (keeps its pages)', run: () => void dropFolder(folder) },
                    ]}
                  />
                )}
              </span>
            </div>
            {shown && (
              <div className="rail-folder-body">
                {inside.length ? inside.map((space) => page(space, true)) : (
                  <p className="rail-folder-empty">Empty. Move a page here from its own menu.</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {naming && naming.folder === null && (
        <NameField value={naming.text} label="New folder name" onChange={(text) => setNaming({ folder: null, text })}
          onDone={() => void finishNaming()} onCancel={() => setNaming(null)} />
      )}

      <div className="rail-space-add">
        {!full && (
          <button type="button" className="rail-link rail-add" onClick={() => void newPage()}>
            {PLUS_ICON}
            <span>New page</span>
          </button>
        )}
        {folders.length < FOLDERS_MAX && !naming && (
          <button type="button" className="rail-add-folder" onClick={() => setNaming({ folder: null, text: '' })}>
            New folder
          </button>
        )}
      </div>
      {problem && <p className="rail-space-problem" role="alert">{problem}</p>}
    </>
  );
}

function NameField({ value, label, onChange, onDone, onCancel }: {
  value: string;
  label: string;
  onChange: (text: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /* Enter, then the blur that follows it, must save once, not twice. */
  const settled = useRef(false);
  const finish = () => {
    if (settled.current) return;
    settled.current = true;
    onDone();
  };
  useEffect(() => ref.current?.focus(), []);
  return (
    <input
      ref={ref}
      className="rail-folder-input"
      aria-label={label}
      placeholder="Folder name"
      maxLength={40}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish();
        if (event.key === 'Escape') {
          settled.current = true;
          onCancel();
        }
      }}
    />
  );
}

function FolderMenu({ items, onClose }: { items: { label: string; run: () => void }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="rail-folder-menu" role="menu">
      {items.map((item) => (
        <button key={item.label} type="button" role="menuitem" onClick={item.run}>{item.label}</button>
      ))}
    </div>
  );
}
