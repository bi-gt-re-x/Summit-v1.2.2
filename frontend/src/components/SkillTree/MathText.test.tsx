import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathText, splitMath } from './MathText';

describe('splitMath', () => {
  it('splits on the math markers', () => {
    expect(splitMath(String.raw`Factor \(x^{2}\) now.`)).toEqual([
      { math: false, text: 'Factor ' },
      { math: true, tex: 'x^{2}', display: false },
      { math: false, text: ' now.' },
    ]);
  });

  it('never treats a dollar sign as math', () => {
    expect(splitMath('Spend $5 and then $10.')).toEqual([{ math: false, text: 'Spend $5 and then $10.' }]);
  });

  it('keeps a dollar sign next to math as text', () => {
    const pieces = splitMath(String.raw`Costs $5 for \(x\) items.`);
    expect(pieces[0]).toEqual({ math: false, text: 'Costs $5 for ' });
    expect(pieces[1]).toEqual({ math: true, tex: 'x', display: false });
  });

  it('reads a display block', () => {
    expect(splitMath(String.raw`\[x\]`)).toEqual([{ math: true, tex: 'x', display: true }]);
  });
});

describe('MathText', () => {
  it('leaves plain text alone', () => {
    const { container } = render(<MathText text="Spend $5 and then $10." />);
    expect(container.textContent).toBe('Spend $5 and then $10.');
    expect(container.querySelector('.katex')).toBeNull();
  });

  it('draws math with KaTeX', async () => {
    const { container } = render(<MathText text={String.raw`Half is \(\frac{1}{2}\).`} />);
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
    expect(container.querySelector('.katex .mfrac')).not.toBeNull();
    expect(screen.getByText('Half is')).toBeTruthy();
  });

  it('shows the source when KaTeX cannot parse it', async () => {
    const { container } = render(<MathText text={String.raw`Bad \(\frac{1}\) one and \(x\).`} />);
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull());
    expect(container.querySelector('.mt-raw')?.textContent).toBe(String.raw`\frac{1}`);
  });
});
