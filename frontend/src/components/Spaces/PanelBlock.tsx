/**
 * A panel block on a space's page: one of the app's own panels — from
 * Analytics, the Timer or Achievements — drawn by the component that page
 * uses, from the account's numbers as they are now.
 *
 * The block stores only its kind and its settings (./panels). What it shows
 * comes from ./SpaceData, which reads once for the whole page and again
 * whenever ./liveWatch says the account moved, so a task finished in another
 * tab shows up here the way it does on a live block. The gear opens the
 * settings, built from the kind's own fields in shared/rules.json: which
 * panel it is, the time range, the subject, how many rows, which measure or
 * lines a chart plots, which parts show. A control inside the panel that the
 * block also has as a setting writes the setting, so it sticks after a
 * reload. ./panelViews says what each kind draws.
 */
import { Component, memo, useCallback, useEffect, useRef, useState, type ErrorInfo, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { Block } from './blocks';
import {
  FIELD_LABEL,
  PANEL_GROUPS,
  PANEL_GROUP_LABEL,
  PANEL_INFO,
  choiceLabel,
  cleanPanel,
  defaultPanel,
  fieldsOf,
  kindsIn,
  needsOf,
  panelKey,
  panelName,
  type Field,
  type FieldName,
  type PanelConfig,
  type PanelKind,
} from './panels';
import { PanelView } from './panelViews';
import { useShared } from './SpaceData';
import { Choice, Ticks, Words } from './Settings';
import { liveOptions } from '@/services/live';
import type { LiveOptions } from './live';

/** A choice list longer than this is a dropdown rather than a row of buttons. */
const BUTTONS_MAX = 6;

/** What each page a panel comes from is called, for the "Open" link. */
const PAGE_NAME: Record<string, string> = {
  '/analytics': 'Analytics',
  '/insights': 'Insights',
  '/recommendations': 'Recommendations',
  '/subjects': 'Subjects',
  '/analytics/growth': 'Growth',
  '/goals': 'Goals',
  '/timer': 'Timer',
  '/achievements': 'Achievements',
};

export interface PanelBlockProps {
  one: Block;
  disabled: boolean;
  register: (node: HTMLDivElement | null) => void;
  onChange: (change: { text?: string; panel?: PanelConfig }) => void;
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function PanelBlock({ one, disabled, register, onChange, onKey }: PanelBlockProps) {
  const config = cleanPanel(one.panel);
  const name = panelName(config.kind);
  const info = PANEL_INFO[config.kind];
  const [open, setOpen] = useState(false);
  /* Bumped by Refresh: the view is drawn again from scratch, so a panel that
     reads on its own (the plan, the badges) reads again. */
  const [round, setRound] = useState(0);
  const shared = useShared();
  /* Through a ref, so the panel's body keeps one `set` and redraws only when
     its settings change, not on every keystroke elsewhere on the page. */
  const latest = useRef(() => config);
  latest.current = () => config;
  const change = useRef(onChange);
  change.current = onChange;
  const set = useCallback(
    (patch: Record<string, unknown>) => change.current({ panel: cleanPanel({ ...latest.current(), ...patch }) }),
    [],
  );
  const refresh = () => {
    if (needsOf(config.kind) === 'model') shared?.data.refresh();
    setRound((n) => n + 1);
  };

  return (
    <div
      ref={register}
      className={`sp-live sp-panel is-${config.kind}`}
      role="figure"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${name}: ${one.text || name}`}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <div className="sp-live-head">
        <span className="sp-live-glyph" aria-hidden="true">{info.glyph}</span>
        <input
          className="sp-chart-title sp-live-title"
          value={one.text}
          placeholder={name}
          aria-label="Block title"
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <span className="sp-live-badge" title="Updates when your data changes">
          <span className="sp-live-dot" aria-hidden="true" />
          <span className="sp-live-badge-word">Live</span>
        </span>
        {!disabled && (
          <button
            type="button"
            className="sp-live-btn"
            aria-label="Block settings"
            title="Settings"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h7M12 4h2M2 12h2M7 12h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10.5" cy="4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="5.5" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        )}
        <button type="button" className="sp-live-btn" aria-label="Refresh" title="Refresh" onClick={refresh}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {open && !disabled && <PanelSettings config={config} onChange={(panel) => onChange({ panel })} />}

      <div className="sp-panel-body">
        <Guard key={`${config.kind}-${round}`}>
          <Body config={config} set={set} />
        </Guard>
      </div>

      <div className="sp-live-foot">
        <span>{info.hint}</span>
        <Go to={info.home}>Open {PAGE_NAME[info.home] ?? 'it'}</Go>
      </div>
    </div>
  );
}

/** The panel itself, drawn again only when its settings change. */
const Body = memo(
  function Body({ config, set }: { config: PanelConfig; set: (patch: Record<string, unknown>) => void }) {
    return <PanelView config={config} set={set} />;
  },
  (was, now) => was.set === now.set && panelKey(was.config) === panelKey(now.config),
);

/** A link inside the app, or a plain one where there is no router (a test). */
function Go({ to, children }: { to: string; children: ReactNode }) {
  return useInRouterContext() ? <Link className="sp-live-link" to={to}>{children}</Link> : <a className="sp-live-link" href={to}>{children}</a>;
}

/** One panel that throws stays one broken block, not a broken page. */
class Guard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A panel block broke in', info.componentStack, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sp-live-note" role="alert">
        This panel hit a snag. The rest of the page is fine.{' '}
        <button type="button" className="sp-ghost" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------
function PanelSettings({ config, onChange }: { config: PanelConfig; onChange: (next: PanelConfig) => void }) {
  const fields = fieldsOf(config.kind);
  const [options, setOptions] = useState<LiveOptions | null>(null);
  const wantsSubjects = fields.some(([name]) => name === 'subject');
  useEffect(() => {
    if (!wantsSubjects) return undefined;
    let live = true;
    liveOptions()
      .then((reply) => {
        if (live && reply.success) setOptions(reply);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wantsSubjects]);

  const set = (name: FieldName, value: unknown) => onChange(cleanPanel({ ...config, [name]: value }));
  return (
    <div className="sp-live-settings" role="group" aria-label="Block settings">
      <label className="sp-live-field">
        Shows
        <select value={config.kind} onChange={(event) => onChange(defaultPanel(event.target.value as PanelKind))}>
          {PANEL_GROUPS.map((group) => (
            <optgroup key={group} label={PANEL_GROUP_LABEL[group]}>
              {kindsIn(group).map((kind) => (
                <option key={kind} value={kind}>{panelName(kind)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {fields.length === 0 && <p className="sp-live-field-hint">This panel has no settings of its own. Use the controls inside it.</p>}
      {fields.map(([name, field]) => (
        <Setting key={name} name={name} field={field} value={config[name]} options={options} onPick={(value) => set(name, value)} />
      ))}
    </div>
  );
}

function Setting({ name, field, value, options, onPick }: {
  name: FieldName;
  field: Field;
  value: PanelConfig[string];
  options: LiveOptions | null;
  onPick: (value: unknown) => void;
}) {
  const label = FIELD_LABEL[name];
  switch (field.type) {
    case 'set':
      return (
        <Ticks
          label={label}
          value={Array.isArray(value) ? value : []}
          choices={field.of}
          name={(choice) => choiceLabel(name, choice)}
          onPick={onPick}
          atLeast={1}
        />
      );
    case 'count':
      return (
        <label className="sp-live-field">
          {label}
          <select value={Number(value)} onChange={(event) => onPick(Number(event.target.value))}>
            {Array.from({ length: field.max - field.min + 1 }, (_, at) => field.min + at).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      );
    case 'ref':
      return (
        <label className="sp-live-field">
          {label}
          <select value={String(value ?? '')} onChange={(event) => onPick(event.target.value)}>
            <option value="">All subjects</option>
            {options?.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
      );
    case 'choice': {
      if (field.of.length > BUTTONS_MAX) {
        return (
          <label className="sp-live-field">
            {label}
            <select
              value={String(value)}
              onChange={(event) => onPick(typeof field.default === 'number' ? Number(event.target.value) : event.target.value)}
            >
              {field.of.map((choice) => (
                <option key={choice} value={String(choice)}>{choiceLabel(name, choice)}</option>
              ))}
            </select>
          </label>
        );
      }
      if (typeof field.default === 'number') {
        return (
          <Choice
            label={label}
            value={Number(value)}
            choices={field.of as readonly number[]}
            name={(n) => choiceLabel(name, n)}
            onPick={onPick}
          />
        );
      }
      return (
        <Words
          label={label}
          value={String(value)}
          choices={field.of as readonly string[]}
          name={(choice) => choiceLabel(name, choice)}
          onPick={onPick}
        />
      );
    }
  }
}
