/**
 * Spreadsheets, a branch of Data Science.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SPREADSHEETS: SubjectTree = {
  id: 'spreadsheets',
  title: 'Spreadsheets',
  blurb: 'Excel and Google Sheets, from first formula to dashboards.',
  parent: 'data-science',
  nodes: [
    { id: 'ss.cells', name: 'Cells & Data Entry', icon: 'grid', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Rows, columns and entering data cleanly. One fact per cell keeps everything easy later on.' },
    { id: 'ss.format', name: 'Formatting', icon: 'palette', tier: 'foundation', requires: ['ss.cells'], state: lock, percent: 0, xp: 1200,
      desc: 'Number formats, borders and colors that make a sheet easy to read. Keep it simple and consistent.' },
    { id: 'ss.formulas', name: 'Formulas', icon: 'equations', tier: 'beginner', core: true, requires: ['ss.cells'], state: lock, percent: 0, xp: 1600,
      desc: 'Starting with an equals sign and pointing at other cells. Change one number and everything updates.' },
    { id: 'ss.refs', name: 'Absolute References', icon: 'pointers', tier: 'beginner', requires: ['ss.formulas'], state: lock, percent: 0, xp: 1700,
      desc: "Locking cells with a dollar sign when you copy formulas. It's the fix for most copied-formula bugs." },
    { id: 'ss.functions', name: 'Common Functions', icon: 'functions', tier: 'beginner', requires: ['ss.formulas'], state: lock, percent: 0, xp: 1400,
      desc: 'SUM, AVERAGE, COUNT, MIN and MAX. These cover most of what school and clubs need.' },
    { id: 'ss.sort', name: 'Sorting & Filtering', icon: 'sorting', tier: 'intermediate', requires: ['ss.format'], state: lock, percent: 0, xp: 1800,
      desc: "Finding what you need in a big list. Filters hide rows without deleting them, so don't panic." },
    { id: 'ss.logic', name: 'IF & Logic', icon: 'conditionals', tier: 'intermediate', requires: ['ss.functions'], state: lock, percent: 0, xp: 1900,
      desc: 'IF, AND, OR and nested conditions. They are perfect for grade calculators and checklists.' },
    { id: 'ss.lookup', name: 'Lookups', icon: 'searching', tier: 'intermediate', core: true, requires: ['ss.logic', 'ss.refs'], state: lock, percent: 0, xp: 2000,
      desc: 'XLOOKUP and VLOOKUP to pull data from other tables. They save hours of copying and pasting.' },
    { id: 'ss.charts', name: 'Charts', icon: 'chart-bars', tier: 'intermediate', requires: ['ss.sort'], state: lock, percent: 0, xp: 1700,
      desc: 'Bar, line and pie charts that make a point. Label the axes and pick the chart that fits the data.' },
    { id: 'ss.clean', name: 'Cleaning Data', icon: 'clean-data', tier: 'advanced', requires: ['ss.sort'], state: lock, percent: 0, xp: 2100,
      desc: 'Removing duplicates, fixing typos and splitting text into columns. Clean the data first, then analyze it.' },
    { id: 'ss.text', name: 'Text & Date Functions', icon: 'calendar-block', tier: 'advanced', requires: ['ss.lookup'], state: lock, percent: 0, xp: 2200,
      desc: 'Combining names, pulling parts of text and doing date math. Dates are secretly just numbers.' },
    { id: 'ss.validate', name: 'Data Validation', icon: 'checklist', tier: 'advanced', requires: ['ss.logic'], state: lock, percent: 0, xp: 2300,
      desc: 'Dropdowns and rules that stop bad entries before they happen. Great for sheets the whole club edits.' },
    { id: 'ss.pivot', name: 'Pivot Tables', icon: 'aggregate', tier: 'advanced', core: true, requires: ['ss.clean', 'ss.lookup'], state: lock, percent: 0, xp: 2000,
      desc: 'Summarizing thousands of rows in seconds. Drag fields around until the answer pops out.' },
    { id: 'ss.trackers', name: 'Budgets & Trackers', icon: 'budget', tier: 'expert', requires: ['ss.charts', 'ss.text'], state: lock, percent: 0, xp: 2400,
      desc: 'Personal budgets, grade trackers and club finances. Real projects make the skills stick.' },
    { id: 'ss.share', name: 'Sharing & Collaboration', icon: 'friends', tier: 'expert', requires: ['ss.validate'], state: lock, percent: 0, xp: 2500,
      desc: 'Sharing, comments and version history in Google Sheets. Protect the important ranges from accidental edits.' },
    { id: 'ss.dash', name: 'Dashboards', icon: 'analytics', tier: 'expert', requires: ['ss.pivot', 'ss.trackers'], state: lock, percent: 0, xp: 2600,
      desc: 'One page that shows the key numbers at a glance. Fewer charts make a clearer story.' },
    { id: 'ss.auto', name: 'Automation', icon: 'automation', tier: 'mastery', requires: ['ss.dash', 'ss.share'], state: lock, percent: 0, xp: 2600,
      desc: 'Macros and Apps Script for the stuff you repeat. If you do it every week, automate it.' },
  ],
};
