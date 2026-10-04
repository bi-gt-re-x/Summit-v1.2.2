/**
 * The toolbar's effect on a range, for the buttons that do their own work.
 *
 * Bold, italic, the lists and the indent go through `document.execCommand`,
 * which jsdom does not implement — those are covered by the fact that they are
 * one line each and by the browser. Everything with a vocabulary of *ours* is
 * hand-written precisely because `execCommand` would write its own CSS, and
 * that is what is worth pinning down here: the classes are the note's meaning,
 * and `utils/htmlToMarkdown` reads them straight back out.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  alignSelection, clearFamily, codeSelection, linkSelection, marksAt,
  spanSelection, toggleBox,
} from './editing';
import { toMarkdown } from '@/utils/htmlToMarkdown';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

/** Put the selection over `text` inside the editor, the way a reader would. */
function select(text: string): void {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walk.nextNode())) {
    const at = (node.nodeValue ?? '').indexOf(text);
    if (at === -1) continue;
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + text.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  throw new Error(`no text node holding ${JSON.stringify(text)}`);
}

/** Put a collapsed caret just inside `text`. */
function caretIn(text: string): void {
  select(text);
  window.getSelection()!.collapseToStart();
}

describe('colour, highlighter, face and size', () => {
  it('wraps the selection in the class the token names', () => {
    root.innerHTML = '<p>keep this bit</p>';
    select('this');
    spanSelection(root, 'red');
    expect(root.querySelector('.md-c-red')?.textContent).toBe('this');
    expect(toMarkdown(root)).toBe('keep [this]{red} bit');
  });

  it('replaces a colour rather than stacking a second one', () => {
    root.innerHTML = '<p><span class="md-c-red">urgent</span></p>';
    select('urgent');
    spanSelection(root, 'blue');
    expect(root.querySelectorAll('[class*="md-c-"]')).toHaveLength(1);
    expect(toMarkdown(root)).toBe('[urgent]{blue}');
  });

  it('leaves the other families where they are', () => {
    root.innerHTML = '<p><span class="md-c-red md-f-serif">both</span></p>';
    select('both');
    spanSelection(root, 'blue');
    const md = toMarkdown(root);
    expect(md).toContain('serif');
    expect(md).toContain('blue');
    expect(md).not.toContain('red');
  });

  it('takes the word under a collapsed caret', () => {
    root.innerHTML = '<p>one two three</p>';
    caretIn('two');
    spanSelection(root, 'green');
    // Not the literal word "text", which is what the old textarea wrote in.
    expect(root.querySelector('.md-c-green')?.textContent).toBe('two');
  });

  it('refuses a token it does not know', () => {
    root.innerHTML = '<p>words here</p>';
    select('words');
    spanSelection(root, 'plaid');
    expect(root.querySelector('span')).toBeNull();
  });

  it('ignores a selection outside the editor', () => {
    const elsewhere = document.createElement('p');
    elsewhere.textContent = 'not the note';
    document.body.append(elsewhere);
    const range = document.createRange();
    range.selectNodeContents(elsewhere);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    root.innerHTML = '<p>untouched</p>';
    spanSelection(root, 'red');
    expect(root.innerHTML).toBe('<p>untouched</p>');
  });
});

describe('the eraser', () => {
  it('takes one family off and leaves the other', () => {
    root.innerHTML = '<p><span class="md-c-red md-b-blue">marked</span></p>';
    select('marked');
    clearFamily(root, 'mark');
    const md = toMarkdown(root);
    expect(md).toContain('red');
    expect(md).not.toContain('bg-blue');
  });

  it('unwraps the shorthand highlight too', () => {
    root.innerHTML = '<p><mark class="md-b-yellow">marked</mark></p>';
    select('marked');
    clearFamily(root, 'mark');
    expect(toMarkdown(root)).toBe('marked');
  });
});

describe('alignment', () => {
  it('puts the class on the line rather than a style on the text', () => {
    root.innerHTML = '<p>A title</p>';
    select('A title');
    alignSelection(root, 'center');
    expect(root.querySelector('p')).toHaveClass('md-a-center');
    expect(toMarkdown(root)).toBe('A title {center}');
  });

  it('replaces an alignment rather than claiming both', () => {
    root.innerHTML = '<p class="md-a-center">A title</p>';
    select('A title');
    alignSelection(root, 'right');
    expect(toMarkdown(root)).toBe('A title {right}');
  });

  it('takes it off when it is pressed again', () => {
    root.innerHTML = '<p class="md-a-center">A title</p>';
    select('A title');
    alignSelection(root, 'center');
    expect(toMarkdown(root)).toBe('A title');
  });
});

describe('links', () => {
  it('writes a pill that stays in the app', () => {
    root.innerHTML = '<p>see it here</p>';
    select('it');
    linkSelection(root, '/tasks?task=a1b2', '');
    const link = root.querySelector('a')!;
    expect(link).toHaveClass('is-task');
    expect(link.getAttribute('data-nav')).toBe('/tasks?task=a1b2');
    expect(link.getAttribute('target')).toBeNull();
    expect(toMarkdown(root)).toBe('see [it](/tasks?task=a1b2) here');
  });

  it('sends an address on the web to its own tab', () => {
    root.innerHTML = '<p>see it here</p>';
    select('it');
    linkSelection(root, 'https://example.com', '');
    const link = root.querySelector('a')!;
    expect(link).toHaveClass('is-external');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
  });

  it('uses the label when nothing is selected', () => {
    root.innerHTML = '<p>see </p>';
    caretIn('see ');
    window.getSelection()!.collapseToEnd();
    linkSelection(root, '/goals?goal=g9', 'Finish Calculus');
    expect(root.querySelector('a')?.textContent).toBe('Finish Calculus');
    expect(root.querySelector('a')).toHaveClass('is-goal');
  });

  it('calls any other route a page', () => {
    root.innerHTML = '<p>x</p>';
    select('x');
    linkSelection(root, '/analytics/growth', '');
    expect(root.querySelector('a')).toHaveClass('is-page');
  });
});

describe('code', () => {
  it('wraps the selection, and comes back as backticks', () => {
    root.innerHTML = '<p>call render now</p>';
    select('render');
    codeSelection(root);
    expect(toMarkdown(root)).toBe('call `render` now');
  });
});

describe('ticking a box', () => {
  it('turns it on and strikes the item through', () => {
    root.innerHTML = '<ul><li><span class="md-box"></span><span>not yet</span></li></ul>';
    const box = root.querySelector('.md-box') as HTMLElement;
    expect(toggleBox(box)).toBe(true);
    expect(toMarkdown(root)).toBe('- [x] not yet');
  });

  it('turns it back off', () => {
    root.innerHTML =
      '<ul><li><span class="md-box is-on"></span><span class="md-done">done</span></li></ul>';
    toggleBox(root.querySelector('.md-box') as HTMLElement);
    expect(toMarkdown(root)).toBe('- [ ] done');
  });

  it('says so when the click was not on a box', () => {
    root.innerHTML = '<p>words</p>';
    expect(toggleBox(root.querySelector('p') as HTMLElement)).toBe(false);
  });
});

describe('what the caret is standing in', () => {
  it('reads the face and the size off the ancestors', () => {
    root.innerHTML = '<p><span class="md-f-serif md-s-24">big</span></p>';
    caretIn('big');
    expect(marksAt(root)).toMatchObject({ face: 'serif', size: 's24' });
  });

  it('reads the shorthand highlight as the token it stands for', () => {
    root.innerHTML = '<p><mark class="md-b-yellow">marked</mark></p>';
    caretIn('marked');
    expect(marksAt(root).mark).toBe('bg-yellow');
  });

  it('finds nothing on plain text', () => {
    root.innerHTML = '<p>plain</p>';
    caretIn('plain');
    expect(marksAt(root)).toEqual({ ink: null, mark: null, face: null, size: null });
  });
});
