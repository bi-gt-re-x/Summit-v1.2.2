import { describe, expect, it } from 'vitest';
import { categoryForSubject } from './Outcome';

const s = (id: string, name: string, group: string, custom = false) => ({ id, name, group, custom });

describe('a goal takes its tile from its subject', () => {
  it.each([
    [s('algebra', 'Algebra', 'Math and science'), 'math'],
    [s('chemistry', 'Chemistry', 'Math and science'), 'school'],
    [s('python', 'Python', 'Computing'), 'coding'],
    [s('machine_learning', 'Machine Learning', 'Computing'), 'ai'],
    [s('piano', 'Piano', 'Creative'), 'music'],
    [s('photography', 'Photography', 'Creative'), 'projects'],
    [s('running', 'Running', 'Health and fitness'), 'fitness'],
    [s('spanish', 'Spanish', 'Language and humanities'), 'school'],
    [s('cooking', 'Cooking', 'Life and home'), 'personal'],
    [s('investing', 'Investing', 'Business and money'), 'projects'],
    [s('own_chess_club', 'Chess club', 'Yours', true), 'other'],
  ])('%o is %s', (subject, want) => {
    expect(categoryForSubject(subject)).toBe(want);
  });

  it('is other with no subject', () => {
    expect(categoryForSubject(null)).toBe('other');
  });
});
