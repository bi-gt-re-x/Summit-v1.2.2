/**
 * The top bar's search field and its drop-down.
 *
 * Searches the AMC site through one request (GET /api/amc/search): pages,
 * problems, topics and contests, each a group of up to five rows. The arrow
 * keys move through every row as one list, Enter opens the highlighted one,
 * and Enter with nothing highlighted — or the last row — opens the full
 * results on /search. ⌘K / Ctrl+K focuses the field from anywhere (Topbar).
 *
 * Requests wait for typing to settle and a stale answer is dropped, so a fast
 * typist sees results for what is in the box, not for what was in it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amc, type SearchResults } from '@/services/amc';
import '@/styles/search.css';

const PER_GROUP = 5;
const SETTLE_MS = 160;
const LIST_ID = 'sf-matches';
const optionId = (hit: Hit) => `sf-option-${hit.key.replace(/[^\w-]/g, '-')}`;

export interface Hit {
  key: string;
  kind: 'page' | 'problem' | 'topic' | 'contest' | 'all';
  name: string;
  meta: string;
  to: string;
}

export interface SearchFieldProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export interface SearchFieldHandle {
  focus: () => void;
}

function hitsFor(results: SearchResults): Record<'page' | 'problem' | 'topic' | 'contest', Hit[]> {
  return {
    page: results.pages.slice(0, PER_GROUP).map((p) => ({
      key: `page:${p.to}`, kind: 'page', name: p.name, meta: 'Page', to: p.to,
    })),
    problem: results.problems.slice(0, PER_GROUP).map((p) => ({
      key: `problem:${p.id}`, kind: 'problem', name: p.source, meta: p.topic_name, to: `/problems/${p.id}`,
    })),
    topic: results.topics.slice(0, PER_GROUP).map((t) => ({
      key: `topic:${t.id}`, kind: 'topic', name: t.name, meta: t.category_name, to: `/topics/${t.id}`,
    })),
    contest: results.contests.slice(0, PER_GROUP).map((c) => ({
      key: `contest:${c.id}`, kind: 'contest', name: c.name, meta: c.kind === 'mock' ? 'Mock' : c.level,
      to: `/contests/${c.id}`,
    })),
  };
}

export const SearchField = forwardRef<SearchFieldHandle, SearchFieldProps>(function SearchField(
  { open, onOpen, onClose },
  ref,
) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [cursor, setCursor] = useState(-1);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const needle = query.trim();
  const ticket = useRef(0);
  useEffect(() => {
    const mine = ++ticket.current;
    if (!needle) {
      setResults(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void amc
        .search(needle, PER_GROUP)
        .then((reply) => {
          if (mine === ticket.current && reply.success) setResults(reply);
        })
        .catch(() => {});
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [needle]);

  const groups = useMemo(() => (results ? hitsFor(results) : null), [results]);
  const all = useMemo<Hit[]>(() => {
    if (!groups || !needle) return [];
    const rows = [...groups.page, ...groups.problem, ...groups.topic, ...groups.contest];
    rows.push({ key: 'all', kind: 'all', name: `See all results for "${needle}"`, meta: '',
                to: `/search?q=${encodeURIComponent(needle)}` });
    return rows;
  }, [groups, needle]);

  useEffect(() => setCursor(-1), [needle]);
  const current = cursor >= 0 ? all[Math.min(cursor, all.length - 1)] : undefined;
  const settled = results?.query === needle;
  const showing = open && needle.length > 0;

  const reset = useCallback(() => {
    setQuery('');
    setCursor(-1);
  }, []);

  const go = useCallback(
    (to: string) => {
      reset();
      onClose();
      inputRef.current?.blur();
      navigate(to);
    },
    [navigate, onClose, reset],
  );

  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        reset();
        onClose();
        inputRef.current?.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (current) go(current.to);
        else if (needle) go(`/search?q=${encodeURIComponent(needle)}`);
        return;
      }
      if (!all.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) onOpen();
        setCursor((c) => (c + 1) % all.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((c) => (c <= 0 ? all.length - 1 : c - 1));
      }
    },
    [all.length, current, go, needle, onClose, onOpen, open, reset],
  );

  const empty = groups && !groups.page.length && !groups.problem.length && !groups.topic.length && !groups.contest.length;

  return (
    <div className="topbar-search-field">
      <svg className="topbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        className="topbar-search-input"
        placeholder="Search problems, topics, contests…  ⌘K"
        aria-label="Search problems, topics, contests and pages"
        role="combobox"
        aria-expanded={showing}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={showing && current ? optionId(current) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={onOpen}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) onOpen();
        }}
        onKeyDown={onKey}
      />

      {showing && (
        <div className="topbar-panel topbar-search sf-panel">
          {!groups || !settled ? (
            <p className="sf-empty">Searching…</p>
          ) : empty ? (
            <p className="sf-empty">Nothing matches "{needle}". Try a topic like "circles" or a year like "2019 AIME".</p>
          ) : (
            <div id={LIST_ID} role="listbox" aria-label="Matches" className="sf-groups">
              <Group label="Pages" rows={groups.page} current={current} onGo={go} />
              <Group label="Problems" rows={groups.problem} current={current} onGo={go} />
              <Group label="Topics" rows={groups.topic} current={current} onGo={go} />
              <Group label="Contests" rows={groups.contest} current={current} onGo={go} />
              <Group label="" rows={all.slice(-1)} current={current} onGo={go} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function Group({
  label,
  rows,
  current,
  onGo,
}: {
  label: string;
  rows: Hit[];
  current: Hit | undefined;
  onGo: (to: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="sf-group" role="presentation">
      {label && (
        <div className="sf-group-head" role="presentation">
          {label}
        </div>
      )}
      <div className="sf-list" role="presentation">
        {rows.map((hit) => (
          <div
            key={hit.key}
            id={optionId(hit)}
            role="option"
            aria-selected={hit.key === current?.key}
            tabIndex={-1}
            className={`sf-row${hit.key === current?.key ? ' is-at' : ''}`}
            // mousedown, not click: the field would blur first and the bar's
            // outside-click listener can close the list before a click lands.
            onMouseDown={(event) => {
              event.preventDefault();
              onGo(hit.to);
            }}
          >
            <span className={`sf-mark is-${hit.kind === 'page' || hit.kind === 'all' ? 'component' : 'task'}`}
                  aria-hidden="true" />
            <span className="sf-row-name">{hit.name}</span>
            <span className="sf-row-meta">{hit.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
