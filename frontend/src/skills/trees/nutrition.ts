/**
 * Nutrition — a branch of Health & Fitness.
 *
 * Deliberately structural rather than prescriptive: energy balance, the three
 * macronutrients, and how to read a claim. Nothing here tells a reader what to
 * eat, because the useful skill is being able to evaluate the next diet that
 * arrives rather than being handed the current one.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const NUTRITION: SubjectTree = {
  id: 'nutrition',
  title: 'Nutrition',
  blurb: 'What food actually does, and how to read a claim about it.',
  parent: 'fitness',
  nodes: [
    { id: 'nu.energy', name: 'Energy Balance', icon: 'energy-balance', tier: 'foundation', core: true, state: open, percent: 25, xp: 1500,
      desc: 'Energy in against energy out, which decides weight over time regardless of the diet it is wrapped in. Every approach that works does so by changing one side of it, usually appetite.' },
    { id: 'nu.macros', name: 'Macronutrients', icon: 'macros', tier: 'foundation', requires: ['nu.energy'], state: lock, percent: 0, xp: 1500,
      desc: 'Protein, carbohydrate and fat, and what each is mainly for. Their proportions matter far less than total energy and total protein for most goals.' },
    { id: 'nu.protein', name: 'Protein', icon: 'protein', tier: 'foundation', requires: ['nu.macros'], state: lock, percent: 0, xp: 1600,
      desc: 'The one that builds and repairs, and the one most under-eaten by people training. Spread across the day beats a single large serving, and adequacy matters more than timing.' },
    { id: 'nu.carbs', name: 'Carbohydrate', icon: 'carbs', tier: 'beginner', requires: ['nu.macros'], state: lock, percent: 0, xp: 1500,
      desc: 'The fuel for hard efforts, stored in muscle and liver in limited amounts. Cutting it does not make fat loss faster; it makes intense sessions harder and the scale move sooner because of water.' },
    { id: 'nu.fats', name: 'Fats', icon: 'fats', tier: 'beginner', requires: ['nu.macros'], state: lock, percent: 0, xp: 1500,
      desc: 'Necessary for hormones and for absorbing several vitamins, and the most energy-dense of the three. The type matters more than the amount within a sensible range.' },
    { id: 'nu.fibre', name: 'Fiber & Gut', icon: 'fibre', tier: 'beginner', requires: ['nu.carbs'], state: lock, percent: 0, xp: 1500,
      desc: 'The part that is not absorbed, which regulates digestion and feeds the bacteria doing the work. Most people eat about half of what is recommended, and increasing it suddenly is uncomfortable.' },
    { id: 'nu.micro', name: 'Vitamins & Minerals', icon: 'micronutrients', tier: 'beginner', requires: ['nu.fibre'], state: lock, percent: 0, xp: 1600,
      desc: 'Small quantities doing specific jobs, with deficiency causing specific problems. Above adequacy, more is not better, and several are actively harmful in excess.' },
    { id: 'nu.water', name: 'Hydration', icon: 'water', tier: 'beginner', requires: ['nu.energy'], state: lock, percent: 0, xp: 1300,
      desc: 'Enough fluid across the day, with electrolytes when sweating heavily. Thirst is a reasonable guide for most people and an unreliable one during long hard efforts.' },
    { id: 'nu.hunger', name: 'Hunger & Satiety', icon: 'satiety', tier: 'intermediate', core: true, requires: ['nu.protein', 'nu.fibre'], state: lock, percent: 0, xp: 1900,
      desc: 'Why some meals hold and others do not: protein, fiber, volume and how processed something is. Managing appetite is what makes any energy target sustainable rather than a fight.' },
    { id: 'nu.timing', name: 'Meal Timing', icon: 'meal-time', tier: 'intermediate', requires: ['nu.hunger'], state: lock, percent: 0, xp: 1600,
      desc: 'When you eat, which matters much less than the internet suggests and does matter around hard training. Consistency helps mainly by making planning easier.' },
    { id: 'nu.plan', name: 'Planning Meals', icon: 'meal-plan', tier: 'intermediate', requires: ['nu.timing'], state: lock, percent: 0, xp: 1700,
      desc: 'Deciding in advance so the decision is not made while hungry. A short list of default meals removes most of the daily friction that derails otherwise reasonable intentions.' },
    { id: 'nu.cook', name: 'Cooking for Yourself', icon: 'cooking', tier: 'intermediate', requires: ['nu.plan'], state: lock, percent: 0, xp: 1700,
      desc: 'The single most effective nutritional intervention available, because it puts you in control of the ingredients and the portion. Five reliable meals is enough to start.' },
    { id: 'nu.labels', name: 'Reading Labels', icon: 'label', tier: 'intermediate', requires: ['nu.micro'], state: lock, percent: 0, xp: 1600,
      desc: 'Ingredients in descending order, and per-hundred figures rather than per-serving ones. Serving sizes are chosen to flatter, and comparing two products on their front-of-pack claims compares two marketing departments.' },
    { id: 'nu.claims', name: 'Evaluating Claims', icon: 'scrutiny', tier: 'advanced', core: true, requires: ['nu.labels'], state: lock, percent: 0, xp: 2100,
      desc: 'Asking who ran the study, on how many people, for how long, and against what. Nutrition research is hard, largely observational, and reported as though it were not.' },
    { id: 'nu.supplements', name: 'Supplements', icon: 'supplement', tier: 'advanced', requires: ['nu.claims'], state: lock, percent: 0, xp: 1900,
      desc: 'The very short list with good evidence, and the very long one without. They fill gaps in a diet and do not substitute for one, whatever the packaging implies.' },
    { id: 'nu.deficit', name: 'Losing Weight', icon: 'deficit', tier: 'advanced', requires: ['nu.hunger'], state: lock, percent: 0, xp: 2100,
      desc: 'A modest energy deficit held long enough, with protein kept high and training maintained. Slower loss keeps more muscle and is far more likely to still be there in a year.' },
    { id: 'nu.gain', name: 'Gaining Weight', icon: 'surplus', tier: 'advanced', requires: ['nu.protein', 'nu.timing'], state: lock, percent: 0, xp: 2000,
      desc: 'A small surplus alongside progressive training. Aggressive surpluses add fat rather than muscle, because the rate at which muscle can be built has a ceiling.' },
    { id: 'nu.sport', name: 'Eating Around Training', icon: 'sports-nutrition', tier: 'advanced', requires: ['nu.gain', 'nu.water'], state: lock, percent: 0, xp: 2100,
      desc: 'Carbohydrate before and during long efforts, protein and food afterwards. The window is hours rather than minutes, which makes most of the urgency around it unnecessary.' },
    { id: 'nu.special', name: 'Special Diets', icon: 'diet', tier: 'expert', requires: ['nu.supplements', 'nu.deficit'], state: lock, percent: 0, xp: 2300,
      desc: 'Vegetarian, vegan, allergen-free and medically restricted eating, and the nutrients each has to plan for. Restriction is workable with attention and quietly deficient without it.' },
    { id: 'nu.relationship', name: 'A Sustainable Relationship with Food', icon: 'balance-food', tier: 'mastery', requires: ['nu.special', 'nu.sport', 'nu.cook'], state: lock, percent: 0, xp: 2900,
      desc: 'Eating well without it occupying the day, and recognizing when tracking has stopped helping. Any approach that cannot survive a holiday or a bad week is not the approach.' },
  ],
};
