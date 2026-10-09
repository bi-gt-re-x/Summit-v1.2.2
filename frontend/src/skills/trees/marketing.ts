/**
 * Marketing — a branch of Business & Money.
 *
 * Positioning gates the channels. A tree that let somebody start at advertising
 * would be describing the commonest and most expensive mistake in the subject:
 * buying attention before deciding who you are for and why they should care.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MARKETING: SubjectTree = {
  id: 'marketing',
  title: 'Marketing',
  blurb: 'Finding the people this is for, and giving them a reason to choose it.',
  parent: 'business',
  nodes: [
    { id: 'mk.problem', name: 'The Problem You Solve', icon: 'problem', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'What somebody was struggling with before this existed. Marketing that starts from features rather than from that struggle is a description rather than a reason to buy.' },
    { id: 'mk.audience', name: 'Audience', icon: 'audience', tier: 'foundation', requires: ['mk.problem'], state: lock, percent: 0, xp: 1500,
      desc: 'Who specifically, in enough detail to know where they already spend their attention. Everybody is not an audience; it is the phrase that precedes a campaign that reaches nobody.' },
    { id: 'mk.research', name: 'Customer Research', icon: 'interview', tier: 'foundation', requires: ['mk.audience'], state: lock, percent: 0, xp: 1600,
      desc: 'Asking people about their behavior rather than their intentions. What somebody did last month predicts far better than what they say they would do.' },
    { id: 'mk.position', name: 'Positioning', icon: 'positioning', tier: 'beginner', core: true, requires: ['mk.research'], state: lock, percent: 0, xp: 1800,
      desc: 'The space you occupy in the mind of a buyer, relative to the alternatives, including doing nothing. Being second-best at everything loses to being clearly first for a narrower group.' },
    { id: 'mk.message', name: 'Messaging', icon: 'message', tier: 'beginner', requires: ['mk.position'], state: lock, percent: 0, xp: 1700,
      desc: 'Saying the thing in words your audience already uses. Clarity beats cleverness reliably, and the test is whether a stranger can repeat what you do after one reading.' },
    { id: 'mk.brand', name: 'Brand', icon: 'brand', tier: 'beginner', requires: ['mk.message'], state: lock, percent: 0, xp: 1700,
      desc: 'The set of associations people carry about you, built by consistency over time. A logo is the smallest part of it and the part most often mistaken for the whole.' },
    { id: 'mk.copy', name: 'Copywriting', icon: 'copywriting', tier: 'intermediate', requires: ['mk.message'], state: lock, percent: 0, xp: 1800,
      desc: 'Words that get one specific action taken. Lead with the benefit, keep the sentences short, and cut every phrase that would survive being deleted.' },
    { id: 'mk.content', name: 'Content', icon: 'content', tier: 'intermediate', requires: ['mk.copy'], state: lock, percent: 0, xp: 1800,
      desc: 'Being useful before asking for anything. It compounds slowly and it is the only channel that keeps working after you stop paying for it.' },
    { id: 'mk.seo', name: 'Search', icon: 'search-engine', tier: 'intermediate', requires: ['mk.content'], state: lock, percent: 0, xp: 1900,
      desc: 'Being found by people already looking for the answer. Intent is what makes search traffic valuable, and matching the page to the question is most of the work.' },
    { id: 'mk.social', name: 'Social Channels', icon: 'social-media', tier: 'intermediate', requires: ['mk.brand'], state: lock, percent: 0, xp: 1800,
      desc: 'Platforms where attention is rented rather than owned, and where the rules change without notice. Pick the one your audience is on rather than all of them badly.' },
    { id: 'mk.email', name: 'Email & Owned Audience', icon: 'email', tier: 'intermediate', core: true, requires: ['mk.content'], state: lock, percent: 0, xp: 1900,
      desc: 'A list you can reach without an intermediary deciding whether to show it. The most durable asset in marketing, and the one that survives every platform change.' },
    { id: 'mk.funnel', name: 'The Funnel', icon: 'funnel', tier: 'intermediate', requires: ['mk.social', 'mk.seo'], state: lock, percent: 0, xp: 1900,
      desc: 'The path from never having heard of you to buying, and the drop at each step. Fixing the worst step beats adding traffic to the top, and it is usually far cheaper.' },
    { id: 'mk.landing', name: 'Landing Pages', icon: 'landing-page', tier: 'advanced', requires: ['mk.funnel', 'mk.copy'], state: lock, percent: 0, xp: 1900,
      desc: 'One page, one audience, one action. Everything that is not helping somebody take that action is competing with it, including navigation you added out of habit.' },
    { id: 'mk.ads', name: 'Paid Advertising', icon: 'advert', tier: 'advanced', requires: ['mk.landing'], state: lock, percent: 0, xp: 2100,
      desc: 'Renting attention, measured against what a customer is worth. It scales what already works and reliably accelerates the failure of what does not.' },
    { id: 'mk.analytics', name: 'Analytics', icon: 'analytics', tier: 'advanced', core: true, requires: ['mk.funnel'], state: lock, percent: 0, xp: 2100,
      desc: 'Deciding which numbers actually indicate progress and watching those. Traffic and impressions flatter; activation, retention and revenue per visitor tell you something.' },
    { id: 'mk.testing', name: 'Testing', icon: 'ab-test', tier: 'advanced', requires: ['mk.analytics'], state: lock, percent: 0, xp: 2100,
      desc: 'Comparing two versions properly, with enough traffic to tell them apart. Most reported wins are noise called early, which is worse than not testing at all.' },
    { id: 'mk.retention', name: 'Retention', icon: 'retention', tier: 'advanced', requires: ['mk.email', 'mk.analytics'], state: lock, percent: 0, xp: 2200,
      desc: 'Keeping the customers you already have, which costs a fraction of finding new ones. A leaking bucket makes acquisition an expensive way to stand still.' },
    { id: 'mk.pricing', name: 'Pricing & Offers', icon: 'price-tag', tier: 'expert', requires: ['mk.retention'], state: lock, percent: 0, xp: 2300,
      desc: 'What to charge, how to package it and when to discount. Price communicates as much as it collects, and cutting it is the fastest way to change what you are understood to be.' },
    { id: 'mk.ethics', name: 'Ethical Persuasion', icon: 'ethics', tier: 'expert', requires: ['mk.ads', 'mk.testing'], state: lock, percent: 0, xp: 2300,
      desc: 'The line between making something easy to choose and making it hard to refuse. Manufactured urgency and awkward cancellation work in the short run and are how trust is spent.' },
    { id: 'mk.strategy', name: 'Marketing Strategy', icon: 'strategy', tier: 'mastery', requires: ['mk.pricing', 'mk.ethics'], state: lock, percent: 0, xp: 2900,
      desc: 'A coherent plan across positioning, channels and budget, with a stated view of who you are not for. The tactics are interchangeable; the choice of which battle to fight is not.' },
  ],
};
