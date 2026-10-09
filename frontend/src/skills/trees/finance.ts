/**
 * Personal Finance & Investing — a branch of Business & Money.
 *
 * Nothing here is advice about what to buy, and the tree is shaped to make that
 * structural rather than a disclaimer: the nodes are about mechanisms, costs and
 * the arithmetic of risk, and the ones about specific instruments sit behind the
 * ones about how badly a fee compounds.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const FINANCE: SubjectTree = {
  id: 'finance',
  title: 'Personal Finance & Investing',
  blurb: 'What money does over decades, and what it costs to have somebody look after it.',
  parent: 'business',
  nodes: [
    { id: 'fi.compound', name: 'Compounding', icon: 'compound', tier: 'foundation', core: true, state: open, percent: 20, xp: 1500,
      desc: 'Growth on growth, which is unremarkable for five years and startling over forty. Every other idea in this tree is a footnote to how much the time in the market matters.' },
    { id: 'fi.inflation', name: 'Inflation', icon: 'inflation', tier: 'foundation', requires: ['fi.compound'], state: lock, percent: 0, xp: 1400,
      desc: 'Money losing purchasing power quietly. Cash under a mattress is not a neutral choice; it is a small guaranteed loss every year, which reframes what "safe" means.' },
    { id: 'fi.risk', name: 'Risk & Return', icon: 'risk', tier: 'foundation', requires: ['fi.compound'], state: lock, percent: 0, xp: 1600,
      desc: 'Higher expected returns come with a wider range of outcomes, including bad ones. Anything advertising the first without the second is either misunderstood or misrepresented.' },
    { id: 'fi.horizon', name: 'Time Horizon', icon: 'horizon', tier: 'beginner', requires: ['fi.risk'], state: lock, percent: 0, xp: 1400,
      desc: 'When the money is actually needed, which decides almost everything else. Money required in two years and money required in thirty are two different problems with different answers.' },
    { id: 'fi.emergency', name: 'Emergency Fund', icon: 'piggy-bank', tier: 'beginner', requires: ['fi.horizon'], state: lock, percent: 0, xp: 1400,
      desc: 'Several months of expenses somewhere boring and immediately reachable. It exists so that an unexpected bill does not force a sale at the worst possible time.' },
    { id: 'fi.assets', name: 'Asset Classes', icon: 'asset-classes', tier: 'beginner', core: true, requires: ['fi.risk'], state: lock, percent: 0, xp: 1700,
      desc: 'Shares, bonds, property, cash and the rest, each with a different shape of return and risk. Understanding what an asset actually is, and who pays you, comes before any decision about it.' },
    { id: 'fi.shares', name: 'Shares', icon: 'stock-chart', tier: 'beginner', requires: ['fi.assets'], state: lock, percent: 0, xp: 1700,
      desc: 'Part-ownership of a business, with a claim on what is left after everybody else is paid. That last clause is why they return more on average and fall further when things go wrong.' },
    { id: 'fi.bonds', name: 'Bonds', icon: 'bond', tier: 'beginner', requires: ['fi.assets'], state: lock, percent: 0, xp: 1700,
      desc: 'Lending money for a fixed return, where the risks are default and rates moving. Their price falls when interest rates rise, which surprises people who bought them for safety.' },
    { id: 'fi.diversify', name: 'Diversification', icon: 'diversify', tier: 'intermediate', core: true, requires: ['fi.shares', 'fi.bonds'], state: lock, percent: 0, xp: 1900,
      desc: 'Spreading holdings so no single failure matters much. It is the one thing in investing that reduces risk without reducing expected return, which is why it gets called the only free lunch.' },
    { id: 'fi.funds', name: 'Funds & Index Tracking', icon: 'fund', tier: 'intermediate', requires: ['fi.diversify'], state: lock, percent: 0, xp: 1800,
      desc: 'Buying a slice of hundreds of holdings in one purchase. Tracking a whole market cheaply beats most active management over long periods, and the evidence for that is not close.' },
    { id: 'fi.fees', name: 'Fees & Costs', icon: 'fees', tier: 'intermediate', requires: ['fi.funds'], state: lock, percent: 0, xp: 1800,
      desc: 'Percentages that sound trivial and compound exactly like returns do, in the wrong direction. One percent a year over a working life is a substantial fraction of the final total.' },
    { id: 'fi.tax', name: 'Tax-Efficient Saving', icon: 'tax-shelter', tier: 'intermediate', requires: ['fi.fees'], state: lock, percent: 0, xp: 1900,
      desc: 'Accounts and wrappers that change what is owed on growth and income. Using the allowance you already have is usually worth more than any change to what is held inside it.' },
    { id: 'fi.pension', name: 'Pensions & Retirement', icon: 'retirement', tier: 'advanced', requires: ['fi.tax', 'fi.horizon'], state: lock, percent: 0, xp: 2100,
      desc: 'Money locked away for decades, often with an employer contribution and tax relief attached. Declining a matched contribution is turning down part of your salary.' },
    { id: 'fi.property', name: 'Property', icon: 'property', tier: 'advanced', requires: ['fi.assets'], state: lock, percent: 0, xp: 2100,
      desc: 'A large, illiquid, borrowed-against, undiversified asset that people also live in. The leverage cuts both ways and the transaction costs make it a poor short-term holding.' },
    { id: 'fi.insurance', name: 'Insurance', icon: 'insurance', tier: 'advanced', requires: ['fi.emergency'], state: lock, percent: 0, xp: 1800,
      desc: 'Paying a small certain cost to avoid a rare catastrophic one. Insure what would be unrecoverable and self-insure what would merely be annoying.' },
    { id: 'fi.behaviour', name: 'Behavior', icon: 'discipline', tier: 'advanced', core: true, requires: ['fi.diversify'], state: lock, percent: 0, xp: 2200,
      desc: 'Not selling in a crash and not buying at a peak. Investor returns lag fund returns, and the gap is entirely this node rather than any question of selection.' },
    { id: 'fi.allocate', name: 'Asset Allocation', icon: 'allocation', tier: 'advanced', requires: ['fi.behaviour', 'fi.pension'], state: lock, percent: 0, xp: 2300,
      desc: 'The split between kinds of asset, which drives most of the variation in outcomes. Deciding it in advance is also the mechanism that makes rebalancing possible.' },
    { id: 'fi.rebalance', name: 'Rebalancing', icon: 'rebalance', tier: 'expert', requires: ['fi.allocate'], state: lock, percent: 0, xp: 2200,
      desc: 'Selling what has grown and buying what has not, on a schedule rather than on a feeling. It enforces the discipline of buying low precisely when it feels wrong.' },
    { id: 'fi.scams', name: 'Scams & Red Flags', icon: 'warning', tier: 'expert', requires: ['fi.fees'], state: lock, percent: 0, xp: 2100,
      desc: 'Guaranteed returns, urgency, complexity and anything that resists a simple question. The pitch is always about the upside; the tell is what happens when you ask about liquidity.' },
    { id: 'fi.plan', name: 'A Financial Plan', icon: 'plan', tier: 'mastery', requires: ['fi.rebalance', 'fi.insurance', 'fi.property'], state: lock, percent: 0, xp: 2900,
      desc: 'Goals, timescales, contributions and the rules you will follow when markets move. Written down in advance, because the point of a plan is that it exists before it is needed.' },
  ],
};
