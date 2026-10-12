/**
 * The notes tagged with this subject, as one of the subject page's folds.
 *
 * Notes used to be read by nothing but the Notes page, so a note tagged
 * Mathematics never showed up anywhere a reader thinking about mathematics
 * would look. This is that place. It lists the newest few, links each one
 * into the editor, and offers a new one already tagged.
 *
 * It asks for the notes itself rather than taking them from the page: the
 * page's two calls are the record it counts from, and a note is not evidence
 * of anything, so it stays out of that arithmetic. A failed read just leaves
 * the fold empty.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fold } from '@/components/Subject/Fold';
import { list as listNotes, type Note } from '@/services/notes';
import { notesForSubject } from '@/utils/noteLinks';

/** How many the fold lists before handing over to the Notes page. */
const SHOWN = 5;

/** The note's title, or its first line when it has none. */
export function noteLabel(note: Pick<Note, 'title' | 'body'>): string {
  if (note.title.trim()) return note.title.trim();
  const line = note.body.split('\n').map((text) => text.replace(/^[#>\-*\s[\]x]+/, '').trim()).find(Boolean);
  return line ? line.slice(0, 80) : 'Untitled note';
}

function when(iso: string): string {
  const at = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SubjectNotes({ subjectId, name }: { subjectId: string; name: string }) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let live = true;
    listNotes()
      .then((result) => {
        if (live && result.success) setNotes(notesForSubject(result.notes, subjectId));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [subjectId]);

  const newest = notes[0];
  const target = encodeURIComponent(subjectId);

  return (
    <Fold
      title="Notes"
      note={`What you've written about ${name}.`}
      figures={[{ label: notes.length === 1 ? 'note' : 'notes', value: String(notes.length) }]}
      lead={newest ? <>Latest: <b>{noteLabel(newest)}</b>.</> : 'Nothing tagged with this subject yet.'}
    >
      {notes.length > 0 && (
        <ul className="sb-notes">
          {notes.slice(0, SHOWN).map((note) => (
            <li key={note.id}>
              <Link to={`/notes?note=${encodeURIComponent(note.id)}`}>{noteLabel(note)}</Link>
              <span>{when(note.updated_at || note.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="sb-tree-actions">
        <Link className="ax-btn ax-btn-primary" to={`/notes?subject=${target}&new=1`}>
          Write a note
        </Link>
        {notes.length > SHOWN && (
          <Link className="ax-btn ax-btn-quiet" to={`/notes?subject=${target}`}>
            All {notes.length}
          </Link>
        )}
      </div>
    </Fold>
  );
}
