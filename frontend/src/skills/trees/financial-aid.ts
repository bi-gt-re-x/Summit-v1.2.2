/**
 * Financial Aid, a branch of School & College.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const FINANCIAL_AID: SubjectTree = {
  id: 'financial-aid',
  title: 'Financial Aid',
  blurb: 'Paying for college without drowning in debt.',
  parent: 'school',
  nodes: [
    { id: 'fa.cost', name: 'What College Costs', icon: 'price-tag', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Tuition, housing, food, books and travel. The sticker price and what families actually pay can be very different.' },
    { id: 'fa.netprice', name: 'Net Price Calculators', icon: 'arithmetic', tier: 'foundation', requires: ['fa.cost'], state: lock, percent: 0, xp: 1200,
      desc: 'Every college has one on its website. Run it with your family before you apply so the offers hold no surprises.' },
    { id: 'fa.types', name: 'Types of Aid', icon: 'fund', tier: 'beginner', requires: ['fa.cost'], state: lock, percent: 0, xp: 1600,
      desc: "Grants, scholarships, work-study and loans. Grants and scholarships don't get paid back." },
    { id: 'fa.fafsa', name: 'The FAFSA', icon: 'source-doc', tier: 'beginner', core: true, requires: ['fa.types'], state: lock, percent: 0, xp: 1700,
      desc: 'The federal form that unlocks most aid. File as soon as it opens, since some aid runs out.' },
    { id: 'fa.docs', name: 'Gathering Documents', icon: 'archive', tier: 'beginner', requires: ['fa.fafsa'], state: lock, percent: 0, xp: 1400,
      desc: 'Tax returns, bank info and an FSA ID. Getting these together is the slowest part, so start early.' },
    { id: 'fa.css', name: 'The CSS Profile', icon: 'paper', tier: 'intermediate', requires: ['fa.fafsa'], state: lock, percent: 0, xp: 1800,
      desc: 'An extra form many private colleges use. It asks for more detail, so start early with your family.' },
    { id: 'fa.sai', name: 'Your SAI', icon: 'gauge', tier: 'intermediate', requires: ['fa.fafsa', 'fa.docs'], state: lock, percent: 0, xp: 1900,
      desc: 'The Student Aid Index from your FAFSA. Colleges use it to decide how much need-based aid you get.' },
    { id: 'fa.merit', name: 'Merit Scholarships', icon: 'gold', tier: 'intermediate', requires: ['fa.types'], state: lock, percent: 0, xp: 2000,
      desc: 'Aid for grades, scores or talents. Some schools give big merit awards to students near the top of their pool.' },
    { id: 'fa.workstudy', name: 'Work-Study', icon: 'employment', tier: 'intermediate', requires: ['fa.types'], state: lock, percent: 0, xp: 1700,
      desc: 'A part-time campus job paid for by aid. Pick one that fits around your class schedule.' },
    { id: 'fa.search', name: 'Finding Scholarships', icon: 'search-engine', tier: 'intermediate', core: true, requires: ['fa.merit'], state: lock, percent: 0, xp: 1800,
      desc: 'Local, school, community and national awards. Small local scholarships get fewer applicants, so apply widely.' },
    { id: 'fa.essays', name: 'Scholarship Essays', icon: 'essay', tier: 'advanced', requires: ['fa.search'], state: lock, percent: 0, xp: 2200,
      desc: 'Writing about goals, service and challenges. Reuse and adapt your strongest essays across applications.' },
    { id: 'fa.letters', name: 'Reading Aid Letters', icon: 'compare', tier: 'advanced', requires: ['fa.sai', 'fa.css'], state: lock, percent: 0, xp: 2300,
      desc: 'Separating free money from loans in an offer. Some letters list loans in a way that looks like free aid.' },
    { id: 'fa.appeal', name: 'Appealing an Offer', icon: 'negotiate', tier: 'advanced', requires: ['fa.letters'], state: lock, percent: 0, xp: 2000,
      desc: 'Asking for more aid when your situation changes or another school offers more. A polite, specific letter often works.' },
    { id: 'fa.loans', name: 'Student Loans', icon: 'interest', tier: 'advanced', requires: ['fa.letters'], state: lock, percent: 0, xp: 2100,
      desc: 'Federal and private loans, interest and repayment. Borrow federal first and only what you need.' },
    { id: 'fa.renew', name: 'Keeping Your Aid', icon: 'retain', tier: 'expert', requires: ['fa.loans', 'fa.essays', 'fa.workstudy'], state: lock, percent: 0, xp: 2500,
      desc: 'GPA rules, credit loads and refiling the FAFSA every year. Losing a scholarship over a missed form really hurts.' },
    { id: 'fa.budget', name: 'A College Budget', icon: 'budget', tier: 'expert', requires: ['fa.renew'], state: lock, percent: 0, xp: 2600,
      desc: 'Planning your money for each semester before it starts. Books, food and trips home add up fast.' },
    { id: 'fa.decide', name: 'Choosing Without Debt Stress', icon: 'decision', tier: 'mastery', requires: ['fa.appeal', 'fa.budget'], state: lock, percent: 0, xp: 2600,
      desc: 'Picking a school with a cost your family can handle. Graduating with little debt gives you more choices later.' },
  ],
};
