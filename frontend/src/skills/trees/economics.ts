/**
 * Economics — a branch of Business & Money.
 *
 * Micro before macro, and models presented as models. The subject is at its most
 * useful as a set of questions to ask about incentives, and at its least when a
 * curve drawn on a board is mistaken for a measurement of the world.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ECONOMICS: SubjectTree = {
  id: 'economics',
  title: 'Economics',
  blurb: 'Scarcity, incentives, prices, and what happens when you add them all up.',
  parent: 'business',
  nodes: [
    { id: 'ec.scarcity', name: 'Scarcity & Choice', icon: 'scarcity', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'Limited means against unlimited wants, which makes every choice a choice against something. The whole subject is the study of that trade-off at different scales.' },
    { id: 'ec.opportunity', name: 'Opportunity Cost', icon: 'opportunity', tier: 'foundation', requires: ['ec.scarcity'], state: lock, percent: 0, xp: 1400,
      desc: 'The value of the best thing you did not do. It is the concept that changes how decisions are made once it is genuinely internalized, and the one most often quoted without being used.' },
    { id: 'ec.incentives', name: 'Incentives', icon: 'incentive', tier: 'foundation', requires: ['ec.opportunity'], state: lock, percent: 0, xp: 1500,
      desc: 'People respond to what they are rewarded for, including in ways nobody intended. Most policy failures are a rule that was obeyed exactly as written.' },
    { id: 'ec.supply', name: 'Supply & Demand', icon: 'supply-demand', tier: 'beginner', core: true, requires: ['ec.incentives'], state: lock, percent: 0, xp: 1700,
      desc: 'Two schedules of willingness meeting at a price. It is a model rather than a law, and its value is in predicting the direction of a change rather than the level of anything.' },
    { id: 'ec.elastic', name: 'Elasticity', icon: 'elasticity', tier: 'beginner', requires: ['ec.supply'], state: lock, percent: 0, xp: 1700,
      desc: 'How much quantity responds to a change in price. It decides who really pays a tax, which is rarely the person the tax is written against.' },
    { id: 'ec.markets', name: 'Market Structures', icon: 'market', tier: 'beginner', requires: ['ec.supply'], state: lock, percent: 0, xp: 1800,
      desc: 'From many small sellers to one, and what changes about price and quantity along the way. Competition is a spectrum, and almost nothing real sits at either end.' },
    { id: 'ec.failure', name: 'Market Failure', icon: 'market-failure', tier: 'intermediate', core: true, requires: ['ec.markets'], state: lock, percent: 0, xp: 1900,
      desc: 'Where prices leave something out: pollution, public goods, information nobody shares. Most economic arguments about policy are arguments about whether one of these is present.' },
    { id: 'ec.behavioural', name: 'Behavioral Economics', icon: 'behaviour', tier: 'intermediate', requires: ['ec.incentives'], state: lock, percent: 0, xp: 1900,
      desc: 'What people actually do, as opposed to what a perfectly rational agent would. Losses looming larger than equivalent gains is the finding with the widest reach.' },
    { id: 'ec.game', name: 'Game Theory', icon: 'game-theory', tier: 'intermediate', requires: ['ec.behavioural'], state: lock, percent: 0, xp: 2000,
      desc: 'Decisions where the outcome depends on what somebody else decides. The prisoner dilemma is the standard example because individually sensible choices produce a jointly worse result.' },
    { id: 'ec.gdp', name: 'Measuring an Economy', icon: 'gdp', tier: 'intermediate', requires: ['ec.failure'], state: lock, percent: 0, xp: 1800,
      desc: 'Output, income and expenditure as three routes to one total. What the headline figure excludes — unpaid work, depletion, distribution — is as informative as what it counts.' },
    { id: 'ec.growth', name: 'Growth', icon: 'growth-curve', tier: 'intermediate', requires: ['ec.gdp'], state: lock, percent: 0, xp: 1900,
      desc: 'More output per person over time, driven mainly by productivity rather than by effort. Small differences in rate compound into enormous differences in living standards within a lifetime.' },
    { id: 'ec.unemployment', name: 'Employment', icon: 'employment', tier: 'intermediate', requires: ['ec.gdp'], state: lock, percent: 0, xp: 1800,
      desc: 'Who is working, who is looking, and who has stopped looking. The headline rate omits the last group, which is why it can improve while things get worse.' },
    { id: 'ec.money', name: 'Money & Banking', icon: 'banking', tier: 'advanced', requires: ['ec.growth'], state: lock, percent: 0, xp: 2100,
      desc: 'What money is, and the fact that most of it is created by commercial banks lending. That mechanism is the part that is genuinely surprising the first time.' },
    { id: 'ec.inflation', name: 'Inflation', icon: 'inflation', tier: 'advanced', requires: ['ec.money'], state: lock, percent: 0, xp: 2000,
      desc: 'A general rise in prices, from demand, from costs, or from expectations feeding themselves. Its costs are unevenly distributed, which is why it is politically explosive at low levels.' },
    { id: 'ec.monetary', name: 'Monetary Policy', icon: 'central-bank', tier: 'advanced', requires: ['ec.inflation'], state: lock, percent: 0, xp: 2200,
      desc: 'A central bank moving interest rates and the quantity of money to steer demand. It acts with a long and variable delay, which is what makes it so hard to get right.' },
    { id: 'ec.fiscal', name: 'Fiscal Policy', icon: 'treasury', tier: 'advanced', requires: ['ec.unemployment'], state: lock, percent: 0, xp: 2100,
      desc: 'Government spending and taxation as levers on the economy. Debt matters relative to the size of the economy and the rate on it, not as an absolute number.' },
    { id: 'ec.trade', name: 'International Trade', icon: 'trade', tier: 'advanced', requires: ['ec.growth'], state: lock, percent: 0, xp: 2100,
      desc: 'Comparative advantage, and why two countries can both gain even when one is better at everything. The aggregate gain is real and so is the fact that it is not shared evenly.' },
    { id: 'ec.dev', name: 'Development', icon: 'development', tier: 'expert', requires: ['ec.trade', 'ec.fiscal'], state: lock, percent: 0, xp: 2400,
      desc: 'Why some countries are rich and others are not, and what actually changes it. Institutions, geography and history all compete for the explanation, and the honest answer uses all three.' },
    { id: 'ec.inequality', name: 'Inequality', icon: 'inequality', tier: 'expert', requires: ['ec.dev'], state: lock, percent: 0, xp: 2400,
      desc: 'How income and wealth are distributed and how that changes over generations. Wealth is far more concentrated than income everywhere, and mobility is what makes the difference bearable or not.' },
    { id: 'ec.data', name: 'Economic Data', icon: 'econ-data', tier: 'expert', requires: ['ec.monetary', 'ec.inequality'], state: lock, percent: 0, xp: 2500,
      desc: 'Finding the series, checking how it is constructed, and noticing revisions. Most confident economic claims in public are made about a number nobody has read the definition of.' },
    { id: 'ec.think', name: 'Thinking Like an Economist', icon: 'econ-lens', tier: 'mastery', requires: ['ec.data', 'ec.game'], state: lock, percent: 0, xp: 2900,
      desc: 'Asking about incentives, margins and what the alternative was, while remembering the models are simplifications. The discipline is useful precisely to the degree it stays aware of what it left out.' },
  ],
};
