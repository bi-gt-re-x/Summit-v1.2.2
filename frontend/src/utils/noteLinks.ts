/**
 * Which notes are about a task, and which are about a subject.
 *
 * A note is about a task in one of two ways, and both count. It can be
 * anchored to it (`task_id`, set when a note is started from the task or from
 * a sitting on it), or it can link to it in its text — the link button writes
 * `[Revise integrals](/tasks?task=<id>)`, which is somebody saying in so many
 * words that this note is about that task. Counting only the anchor would hide
 * every note written the second way.
 *
 * A note is about a subject when the subject is one of its tags.
 *
 * Pure, so the Tasks page, the Subject page and the Notes page all agree, and
 * so it is testable without any of them. See noteLinks.test.ts.
 */
import type { Note } from '@/services/notes';

/** The ids in a comma-separated subject list. */
function tagsOf(note: Pick<Note, 'subject_ids'>): string[] {
  return (note.subject_ids ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

/** Whether a note is about this task, by anchor or by a link in its text. */
export function isAboutTask(note: Pick<Note, 'task_id' | 'body'>, taskId: string): boolean {
  if (note.task_id === taskId) return true;
  return note.body.includes(`/tasks?task=${encodeURIComponent(taskId)})`);
}

/** The notes about one task, in the order given (the API's: pinned, then newest). */
export function notesForTask<T extends Pick<Note, 'task_id' | 'body'>>(notes: T[], taskId: string): T[] {
  return notes.filter((note) => isAboutTask(note, taskId));
}

/** The notes tagged with one subject, in the order given. */
export function notesForSubject<T extends Pick<Note, 'subject_ids'>>(notes: T[], subjectId: string): T[] {
  return notes.filter((note) => tagsOf(note).includes(subjectId));
}

/**
 * How many notes are about each task, for a list of rows that each want a
 * count. One pass over the notes rather than one filter per row.
 */
export function noteCountsByTask(notes: Pick<Note, 'task_id' | 'body'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  const LINK = /\/tasks\?task=([^)\s]+)\)/g;
  for (const note of notes) {
    const ids = new Set<string>();
    if (note.task_id) ids.add(note.task_id);
    for (const match of note.body.matchAll(LINK)) {
      try {
        ids.add(decodeURIComponent(match[1]!));
      } catch {
        // A hand-typed link with a stray % is not a link to anything.
      }
    }
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return counts;
}
