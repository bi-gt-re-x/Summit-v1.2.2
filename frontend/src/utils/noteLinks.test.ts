import { describe, expect, it } from 'vitest';
import { isAboutTask, noteCountsByTask, notesForSubject, notesForTask } from './noteLinks';

const note = (over: { task_id?: string; body?: string; subject_ids?: string } = {}) => ({
  body: '', subject_ids: '', ...over,
});

describe('which notes are about a task', () => {
  it('counts the anchor', () => {
    expect(isAboutTask(note({ task_id: 't1' }), 't1')).toBe(true);
  });

  it('counts a link to the task in the text', () => {
    expect(isAboutTask(note({ body: 'See [it](/tasks?task=t1) first' }), 't1')).toBe(true);
  });

  it('does not mistake one task for another whose id starts the same way', () => {
    expect(isAboutTask(note({ body: '[it](/tasks?task=t10)' }), 't1')).toBe(false);
  });

  it('filters a list, keeping its order', () => {
    const list = [note({ task_id: 't1', body: 'a' }), note({ body: 'b' }), note({ body: '[x](/tasks?task=t1)' })];
    expect(notesForTask(list, 't1').map((n) => n.body)).toEqual(['a', '[x](/tasks?task=t1)']);
  });

  it('counts each note once per task, whichever way it points there', () => {
    const counts = noteCountsByTask([
      note({ task_id: 't1', body: '[again](/tasks?task=t1)' }),
      note({ body: '[a](/tasks?task=t1) and [b](/tasks?task=t%202)' }),
    ]);
    expect(counts.get('t1')).toBe(2);
    expect(counts.get('t 2')).toBe(1);
  });
});

describe('which notes are about a subject', () => {
  it('reads the tags', () => {
    const list = [note({ subject_ids: 'maths, physics' }), note({ subject_ids: 'mathsx' }), note()];
    expect(notesForSubject(list, 'maths')).toHaveLength(1);
  });
});
