/**
 * The top bar's search: it asks the AMC search endpoint, groups what comes
 * back, and Enter with nothing highlighted opens the full results page.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchField } from './Panel';
import { amc } from '@/services/amc';

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}

afterEach(() => vi.restoreAllMocks());

describe('SearchField', () => {
  it('groups results and sends Enter to the results page', async () => {
    vi.spyOn(amc, 'search').mockResolvedValue({
      success: true,
      query: 'circle',
      problems: [{ id: 'step-10-16', level: 'AMC 10', topic_name: 'Circles', difficulty: 3, preview: 'A circle', source: 'Step Mock AMC 10 #16' }],
      topics: [{ id: 'circles', name: 'Circles', summary: 'Chords', category_name: 'Geometry' }],
      contests: [],
      pages: [],
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SearchField open onOpen={() => {}} onClose={() => {}} />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    );
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'circle' } });
    expect(await screen.findByText('Step Mock AMC 10 #16')).toBeInTheDocument();
    expect(screen.getByText('Topics')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=circle');
  });

  it('opens the highlighted row', async () => {
    vi.spyOn(amc, 'search').mockResolvedValue({
      success: true, query: 'aime', problems: [], topics: [], pages: [],
      contests: [{ id: '2019-aime-i', name: '2019 AIME I', level: 'AIME', kind: 'past' }],
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SearchField open onOpen={() => {}} onClose={() => {}} />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    );
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'aime' } });
    await screen.findByText('2019 AIME I');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('where')).toHaveTextContent('/contests/2019-aime-i');
  });
});
