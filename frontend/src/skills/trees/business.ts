/**
 * Business & Money — a root subject.
 *
 * Personal money sits in the trunk rather than in the Finance branch, because
 * the catalogue files budgeting and taxes next to investing and everybody needs
 * the first two whether or not they ever meet the third. The forks are the
 * places it becomes somebody's job rather than everybody's problem.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const BUSINESS: SubjectTree = {
  id: 'business',
  title: 'Business & Money',
  blurb: 'Where money comes from, where it goes, and what an organization does with it.',
  group: 'Business and money',
  nodes: [
    { id: 'bu.budget', name: 'Budgeting', icon: 'budget', tier: 'foundation', core: true, state: done, percent: 100, xp: 1300,
      desc: 'Knowing what comes in, what goes out and what is left before the month decides for you. Almost every money problem that is not an income problem is solved at this node.' },
    { id: 'bu.track', name: 'Tracking Spending', icon: 'ledger', tier: 'foundation', requires: ['bu.budget'], state: prog, percent: 65, xp: 1200,
      desc: 'Recording where it actually went rather than where you assumed. Two months of honest records changes more behavior than any amount of resolve.' },
    { id: 'bu.savings', name: 'Saving & Buffers', icon: 'piggy-bank', tier: 'foundation', requires: ['bu.track'], state: prog, percent: 40, xp: 1400,
      desc: 'Money set aside before it can be spent, starting with enough to absorb a broken boiler. The buffer is what stops a small emergency from becoming an expensive debt.' },
    { id: 'bu.debt', name: 'Debt & Interest', icon: 'interest', tier: 'beginner', core: true, requires: ['bu.savings'], state: open, percent: 25, xp: 1600,
      desc: 'What borrowing costs, and why compounding runs against you exactly as hard as it runs for you. The rate and the term together decide the total, and the monthly payment hides both.' },
    { id: 'bu.credit', name: 'Credit', icon: 'credit-card', tier: 'beginner', requires: ['bu.debt'], state: lock, percent: 0, xp: 1400,
      desc: 'How lenders decide what you can borrow and at what price. Boring habits build it, and the score is a summary of your record rather than a judgment about you.' },
    { id: 'bu.tax', name: 'Taxes', icon: 'tax', tier: 'beginner', requires: ['bu.track'], state: lock, percent: 0, xp: 1700,
      desc: 'What is owed, when, and which reliefs exist. Marginal rates are the piece most people have wrong: earning more never leaves you with less overall.' },
    { id: 'bu.income', name: 'Income & Earning', icon: 'income', tier: 'beginner', requires: ['bu.budget'], state: lock, percent: 0, xp: 1500,
      desc: 'Salary, self-employment and everything irregular, seen after tax and after the costs of earning it. Comparing offers on gross pay alone is how people take a pay cut by accident.' },
    { id: 'bu.pricing', name: 'Value & Price', icon: 'price-tag', tier: 'beginner', requires: ['bu.income'], state: lock, percent: 0, xp: 1600,
      desc: 'What something costs to make, what it is worth to a buyer, and why those two rarely meet in the middle. Pricing from cost alone leaves money on the table or prices you out entirely.' },
    { id: 'bu.records', name: 'Bookkeeping', icon: 'bookkeeping', tier: 'intermediate', core: true, requires: ['bu.tax', 'bu.pricing'], state: lock, percent: 0, xp: 1800,
      desc: 'Every transaction recorded twice, so the books have to balance. Four hundred years old, still the standard, and the reason an error announces itself rather than hiding.' },
    { id: 'bu.statements', name: 'Financial Statements', icon: 'balance-sheet', tier: 'intermediate', requires: ['bu.records'], state: lock, percent: 0, xp: 2000,
      desc: 'Three views of one business: what it owns, what it earned, and what actually moved. Reading them together is the skill, because each one alone can be made to look fine.' },
    { id: 'bu.cashflow', name: 'Cash Flow', icon: 'cashflow', tier: 'intermediate', requires: ['bu.statements'], state: lock, percent: 0, xp: 2000,
      desc: 'Money in the account by the date it is needed, which is not the same as being profitable. Profitable businesses fail from running out of cash more often than from anything else.' },
    { id: 'bu.model', name: 'Business Models', icon: 'business-model', tier: 'intermediate', requires: ['bu.pricing'], state: lock, percent: 0, xp: 1900,
      desc: 'Who pays, for what, how often, and what it costs to serve them. Most failed ventures had a product and never had an answer to the second half of that sentence.' },
    { id: 'bu.customers', name: 'Customers', icon: 'customer', tier: 'intermediate', requires: ['bu.model'], state: lock, percent: 0, xp: 1800,
      desc: 'Who has the problem, how badly, and what they do about it today. Talking to twenty of them beats a year of planning, and is the step that gets skipped for being uncomfortable.' },
    { id: 'bu.unit', name: 'Unit Economics', icon: 'unit-econ', tier: 'advanced', core: true, requires: ['bu.cashflow', 'bu.customers'], state: lock, percent: 0, xp: 2200,
      desc: 'What one customer earns and what one customer costs to win and serve. If the second is bigger, growth makes things worse, which is a lesson usually learned expensively.' },
    { id: 'bu.risk', name: 'Risk', icon: 'risk', tier: 'advanced', requires: ['bu.unit'], state: lock, percent: 0, xp: 2100,
      desc: 'What could go wrong, how likely, and what it would cost. Insurance, reserves and diversification are three answers, and knowing which risks you are keeping is the point.' },
    { id: 'bu.legal', name: 'Structures & Contracts', icon: 'contract', tier: 'advanced', requires: ['bu.risk'], state: lock, percent: 0, xp: 2100,
      desc: 'The legal form of a venture, what it protects, and what a contract is actually promising. Reading the termination and liability clauses first is the habit worth acquiring.' },
    { id: 'bu.negotiate', name: 'Negotiation', icon: 'negotiate', tier: 'advanced', requires: ['bu.legal'], state: lock, percent: 0, xp: 2200,
      desc: 'Finding the deal both sides prefer to no deal. Knowing your walk-away point beforehand is most of it, and asking what the other side needs beats arguing about what you want.' },
    { id: 'bu.strategy', name: 'Strategy', icon: 'strategy', tier: 'expert', requires: ['bu.unit', 'bu.negotiate'], state: lock, percent: 0, xp: 2600,
      desc: 'Deciding what to do and, harder, what not to. A strategy that does not rule anything out is a list of ambitions with a better name.' },
    { id: 'bu.finance', name: 'Personal Finance & Investing', icon: 'portfolio', tier: 'advanced', requires: ['bu.debt'], navTo: 'finance', state: lock,
      desc: 'A subject of its own: what to do with money once there is more of it than this month needs.' },
    { id: 'bu.econ', name: 'Economics', icon: 'economics', tier: 'advanced', requires: ['bu.pricing'], navTo: 'economics', state: lock,
      desc: 'A subject of its own: how prices, incentives and whole economies behave, from a market stall to a state.' },
    { id: 'bu.marketing', name: 'Marketing', icon: 'marketing', tier: 'advanced', requires: ['bu.customers'], navTo: 'marketing', state: lock,
      desc: 'A subject of its own: finding the people this is for, and giving them a reason to choose it.' },
    { id: 'bu.manage', name: 'Management', icon: 'management', tier: 'expert', requires: ['bu.strategy'], navTo: 'management', state: lock,
      desc: 'A subject of its own: getting work done through other people without becoming the bottleneck.' },
  ],
};
