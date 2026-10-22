/**
 * The panel registry — components/Spaces/panels — and the views that draw it.
 *
 * How a stored panel is cleaned is pinned against the server by
 * shared/cases/space_panels.json (frontend/src/shared.cases.test.ts). This
 * file holds the registry to itself: every kind named, filed, drawable and
 * settable, every setting's default one of its own choices, and the reads a
 * page makes worked out from its blocks.
 */
import { describe, expect, it } from 'vitest';
import {
  CHOICE_LABEL,
  FIELD_LABEL,
  MODEL_WINDOW,
  PANEL_GROUPS,
  PANEL_GROUP_LABEL,
  PANEL_INFO,
  PANEL_KINDS,
  choiceLabel,
  cleanPanel,
  defaultPanel,
  fieldsOf,
  groupOf,
  kindsIn,
  modelKey,
  needsOf,
  pageNeeds,
  panelKey,
  panelName,
  splitKey,
} from './panels';
import { VIEW_KINDS } from './panelViews';
import { normalise, panelBlock, duplicate } from './blocks';

describe('every kind', () => {
  it('has a name, a hint, a mark, a page to open, and a section of the menu', () => {
    expect(Object.keys(PANEL_INFO).sort()).toEqual([...PANEL_KINDS].sort());
    for (const kind of PANEL_KINDS) {
      expect(panelName(kind)).toMatch(/\S/);
      expect(PANEL_INFO[kind].hint).toMatch(/\S/);
      expect(PANEL_INFO[kind].glyph).toMatch(/\S/);
      expect(PANEL_INFO[kind].home.startsWith('/')).toBe(true);
      expect(PANEL_GROUPS).toContain(groupOf(kind));
    }
  });

  it('is drawn by exactly one view', () => {
    expect([...VIEW_KINDS].sort()).toEqual([...PANEL_KINDS].sort());
  });

  it('sits in one section, and every section has some', () => {
    const filed = PANEL_GROUPS.flatMap((group) => kindsIn(group));
    expect(filed.sort()).toEqual([...PANEL_KINDS].sort());
    for (const group of PANEL_GROUPS) {
      expect(kindsIn(group).length).toBeGreaterThan(0);
      expect(PANEL_GROUP_LABEL[group]).toMatch(/\S/);
    }
  });

  it('has a setting for its default that is one of its own choices', () => {
    for (const kind of PANEL_KINDS) {
      for (const [name, field] of fieldsOf(kind)) {
        expect(FIELD_LABEL[name]).toMatch(/\S/);
        if (field.type === 'choice') expect(field.of).toContain(field.default);
        if (field.type === 'set') {
          expect(field.default.length).toBeGreaterThan(0);
          for (const one of field.default) expect(field.of).toContain(one);
        }
        if (field.type === 'count') {
          expect(field.default).toBeGreaterThanOrEqual(field.min);
          expect(field.default).toBeLessThanOrEqual(field.max);
        }
      }
    }
  });

  it('starts clean: a new block is already what the cleaner would make it', () => {
    for (const kind of PANEL_KINDS) {
      const fresh = defaultPanel(kind);
      expect(fresh.kind).toBe(kind);
      expect(cleanPanel(fresh)).toEqual(fresh);
    }
  });

  it('names every choice in words, not as a stored id', () => {
    for (const kind of PANEL_KINDS) {
      for (const [name, field] of fieldsOf(kind)) {
        if (field.type === 'set') {
          for (const one of field.of) expect(CHOICE_LABEL.show?.[one], `${kind} ${one}`).toBeTruthy();
        }
        if (field.type === 'choice' && name !== 'category') {
          for (const one of field.of) expect(choiceLabel(name, one), `${kind} ${name} ${one}`).not.toMatch(/^(\d+d|\d+y|[a-z]+-[a-z]+)$/);
        }
      }
    }
  });

  it('reads like a person wrote it', () => {
    const words = PANEL_KINDS.flatMap((kind) => [panelName(kind), PANEL_INFO[kind].hint]);
    for (const line of words) expect(line).not.toMatch(/[—“”‘’]|practise|colour/);
  });
});

describe('a setting changed in the block', () => {
  it('keeps what the kind takes and drops what it does not', () => {
    const tiles = cleanPanel({ ...defaultPanel('tiles'), show: ['quality', 'productivity'], metric: 'tasks' });
    expect(tiles).toEqual({ kind: 'tiles', window: '30d', show: ['productivity', 'quality'] });
  });

  it('starts a kind over on its own defaults when the block is switched to it', () => {
    const plan = cleanPanel({ ...defaultPanel('trajectory'), kind: 'plan' });
    expect(plan).toEqual(defaultPanel('plan'));
  });

  it('keys the same whatever order the settings were written in', () => {
    expect(panelKey(cleanPanel({ kind: 'tiles', show: ['tasks', 'focus'], window: '7d' }))).toBe(
      panelKey(cleanPanel({ window: '7d', kind: 'tiles', show: ['focus', 'tasks'] })),
    );
  });
});

describe('what a page reads for its panels', () => {
  it('shares one model for panels set the same way, and one per range and subject otherwise', () => {
    const blocks = [
      panelBlock('tiles'),
      panelBlock('trajectory'),
      { ...panelBlock('quality'), panel: cleanPanel({ kind: 'quality', window: '90d', subject: 'mathematics' }) },
      panelBlock('plan'),
      panelBlock('badges'),
      { id: 't', type: 'text', text: 'not a panel' },
    ];
    const needs = pageNeeds(blocks);
    expect(JSON.parse(needs.models)).toEqual(['30d|', '90d|', '90d|mathematics']);
    expect(needs.timer).toBe(false);
  });

  it('runs the clock only when a timer panel is on the page', () => {
    expect(pageNeeds([panelBlock('timer-today')]).timer).toBe(true);
    expect(pageNeeds([panelBlock('timer-today')]).models).toBe('[]');
  });

  it('reads nothing for a panel that reads on its own', () => {
    for (const kind of ['badges', 'growth-line', 'sessions', 'goals-finished'] as const) {
      expect(needsOf(kind)).toBe('self');
    }
    expect(pageNeeds([panelBlock('growth-line')]).models).toBe('[]');
  });

  it('puts a panel with no range of its own on the default model', () => {
    expect(modelKey(defaultPanel('plan'))).toBe(`${MODEL_WINDOW}|`);
    expect(splitKey('90d|maths|extra')).toEqual({ span: '90d', subject: 'maths|extra' });
  });
});

describe('the page model', () => {
  it("keeps a panel block's settings and nothing it showed", () => {
    const doc = normalise({
      blocks: [{ id: 'a', type: 'panel', text: 'Mine', panel: { kind: 'habits', window: '1y', limit: 3, data: [1] } as never }],
    });
    expect(doc.blocks[0]).toEqual({ id: 'a', type: 'panel', text: 'Mine', panel: { kind: 'habits', window: '1y', subject: '', limit: 3 } });
  });

  it('copies the settings when a panel is duplicated, not the same object', () => {
    const one = { ...panelBlock('tiles'), id: 'p' };
    const { blocks, copy } = duplicate([one], 'p');
    const made = blocks.find((block) => block.id === copy)!;
    expect(made.panel).toEqual(one.panel);
    expect(made.panel).not.toBe(one.panel);
    expect(made.panel!.show).not.toBe(one.panel!.show);
  });
});
