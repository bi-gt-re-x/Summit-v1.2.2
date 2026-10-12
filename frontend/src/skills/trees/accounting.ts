/**
 * Accounting, a branch of Business & Money.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ACCOUNTING: SubjectTree = {
  id: 'accounting',
  title: 'Accounting',
  blurb: 'The language of business, from debits and credits to real statements.',
  parent: 'business',
  nodes: [
    { id: 'acc.why', name: 'What Accounting Is For', icon: 'question', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Recording money so owners, banks and the government can trust the numbers. Every business decision leans on it.' },
    { id: 'acc.equation', name: 'The Accounting Equation', icon: 'balance-scale', tier: 'foundation', core: true, requires: ['acc.why'], state: lock, percent: 0, xp: 1200,
      desc: 'Assets equal liabilities plus equity, always. Every transaction keeps both sides in balance.' },
    { id: 'acc.accounts', name: 'Types of Accounts', icon: 'labels', tier: 'beginner', requires: ['acc.equation'], state: lock, percent: 0, xp: 1600,
      desc: 'Assets, liabilities, equity, revenue and expenses. Sort each one before you record anything.' },
    { id: 'acc.debits', name: 'Debits & Credits', icon: 'ledger', tier: 'beginner', core: true, requires: ['acc.accounts'], state: lock, percent: 0, xp: 1700,
      desc: "Left side and right side, and which accounts each one grows. It's backwards from your bank app at first, then it clicks." },
    { id: 'acc.journal', name: 'Journal Entries', icon: 'notebook', tier: 'beginner', requires: ['acc.debits'], state: lock, percent: 0, xp: 1400,
      desc: 'Recording each transaction with a date, accounts and amounts. Debits always equal credits.' },
    { id: 'acc.ledger', name: 'The General Ledger', icon: 'bookkeeping', tier: 'intermediate', requires: ['acc.journal'], state: lock, percent: 0, xp: 1800,
      desc: 'Posting entries into T-accounts and finding balances. It shows where every dollar sits.' },
    { id: 'acc.trial', name: 'Trial Balance', icon: 'checklist', tier: 'intermediate', requires: ['acc.ledger'], state: lock, percent: 0, xp: 1900,
      desc: 'Checking that total debits match total credits. A mismatch means something got posted wrong.' },
    { id: 'acc.adjusting', name: 'Adjusting Entries', icon: 'edit-pen', tier: 'intermediate', requires: ['acc.trial'], state: lock, percent: 0, xp: 2000,
      desc: 'Accruals, deferrals and depreciation at the end of a period. They match revenue and expenses to the right month.' },
    { id: 'acc.income', name: 'Income Statement', icon: 'income', tier: 'advanced', core: true, requires: ['acc.adjusting'], state: lock, percent: 0, xp: 2000,
      desc: 'Revenue minus expenses equals profit or loss. It shows how a business did over a stretch of time.' },
    { id: 'acc.balance', name: 'Balance Sheet', icon: 'balance-sheet', tier: 'advanced', requires: ['acc.adjusting'], state: lock, percent: 0, xp: 2100,
      desc: "What a business owns and owes on a single day. It always balances, because it's built to." },
    { id: 'acc.cash', name: 'Cash Flow Statement', icon: 'cashflow', tier: 'advanced', requires: ['acc.income', 'acc.balance'], state: lock, percent: 0, xp: 2200,
      desc: 'Where cash actually came from and went. A profitable business can still run out of cash.' },
    { id: 'acc.inventory', name: 'Inventory', icon: 'warehouse', tier: 'advanced', requires: ['acc.ledger'], state: lock, percent: 0, xp: 2300,
      desc: 'FIFO, LIFO and the cost of goods sold. The method you choose changes reported profit.' },
    { id: 'acc.payroll', name: 'Payroll', icon: 'employment', tier: 'expert', requires: ['acc.adjusting'], state: lock, percent: 0, xp: 2300,
      desc: 'Wages, withholding and employer taxes. Your own paycheck stub makes a great example.' },
    { id: 'acc.ratios', name: 'Financial Ratios', icon: 'analytics', tier: 'expert', requires: ['acc.cash'], state: lock, percent: 0, xp: 2400,
      desc: 'Margins, liquidity and debt ratios to compare businesses. One ratio alone can mislead, so use a few together.' },
    { id: 'acc.software', name: 'Accounting Software', icon: 'grid', tier: 'expert', requires: ['acc.trial'], state: lock, percent: 0, xp: 2500,
      desc: 'QuickBooks, spreadsheets and how they automate the cycle. Knowing the manual steps makes the software make sense.' },
    { id: 'acc.career', name: 'Accounting Paths', icon: 'career', tier: 'mastery', requires: ['acc.ratios', 'acc.payroll', 'acc.inventory', 'acc.software'], state: lock, percent: 0, xp: 2900,
      desc: 'Bookkeeping, CPA, auditing and FBLA accounting events. Strong accounting skills open doors in every business field.' },
  ],
};
