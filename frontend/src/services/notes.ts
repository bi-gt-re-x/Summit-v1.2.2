/**
 * Notes — free-form writing, optionally attached to a day, a task or a goal.
 *
 * Backend: backend/api/notes.py, over the table in data/sql/notes.sql.
 *
 * Three calls, and `save` is deliberately one of them rather than two: create
 * and edit differ by whether an `id` is sent, the page has one form, and two
 * endpoints would have meant two client functions whose only difference was
 * which field they left out.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export interface Note {
  id: string;
  title: string;
  body: string;
  /** The day this is about, "2026-08-16". Absent on a note about no day. */
  note_date?: string;
  task_id?: string;
  goal_id?: string;
  /**
   * What the note is about — catalogue subject ids, comma-separated.
   *
   * Absent on every note written before the column existed, which is why every
   * reader goes through `subjectIds` in the old Notes page rather than splitting this
   * directly: `undefined.split` is the shape of that bug.
   */
  subject_ids?: string;
  /** The shelf it is on: a catalogue group name, or absent for unfiled. */
  notebook?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** What a save sends. Everything but the id is written as given. */
export interface NoteDraft {
  id?: string;
  title: string;
  body: string;
  note_date?: string;
  pinned?: boolean;
  /**
   * What the note is about, when it is about one of them.
   *
   * Both have been columns on `notes` and accepted by /api/notes/save since
   * the table existed; they were missing from this type only because nothing
   * had written one yet. The goals page writes `goal_id` for its margin notes.
   */
  goal_id?: string;
  task_id?: string;
  /** Comma-separated catalogue ids. Sent even when empty — clearing is a write. */
  subject_ids?: string;
  notebook?: string;
}

export function list(): Promise<ApiResult<{ notes: Note[] }>> {
  return get<{ notes: Note[] }>('/api/notes');
}

export function save(
  draft: NoteDraft,
): Promise<ApiResult<{ note: Note }>> {
  return post<{ note: Note }>('/api/notes/save', { ...draft });
}

export function remove(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/notes/delete', { id });
}
