/**
 * Cooking — a branch of Life & Home.
 *
 * Heat, salt and knife work at the root, because they are what every recipe
 * assumes and never states. A tree of recipes teaches somebody to follow
 * instructions; this one is arranged so that recipes stop being necessary.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const COOKING: SubjectTree = {
  id: 'cooking',
  title: 'Cooking',
  blurb: 'Enough technique that a recipe becomes a suggestion.',
  parent: 'life',
  nodes: [
    { id: 'ck.kit', name: 'Kit & Kitchen Setup', icon: 'pan', tier: 'foundation', core: true, state: open, percent: 25, xp: 1200,
      desc: 'A sharp knife, a heavy pan, a board and a way to measure. Six good pieces beat a drawer of gadgets, and a blunt knife is the most dangerous thing in most kitchens.' },
    { id: 'ck.knife', name: 'Knife Skills', icon: 'knife', tier: 'foundation', requires: ['ck.kit'], state: lock, percent: 0, xp: 1500,
      desc: 'A grip that is safe, a claw with the other hand, and pieces of an even size. Even sizing is not neatness; it is the difference between everything cooking at the same rate and half of it burning.' },
    { id: 'ck.heat', name: 'Heat Control', icon: 'heat', tier: 'foundation', core: true, requires: ['ck.kit'], state: lock, percent: 0, xp: 1600,
      desc: 'Knowing when a pan is hot enough, and that most home cooking happens too cool and too crowded. Browning needs space and real heat, and it is where most of the flavor comes from.' },
    { id: 'ck.salt', name: 'Salt & Seasoning', icon: 'salt', tier: 'foundation', requires: ['ck.heat'], state: lock, percent: 0, xp: 1500,
      desc: 'Seasoning throughout rather than at the end, and tasting as you go. The most common reason home food is flat is that it was salted once, off the heat, from a shaker.' },
    { id: 'ck.acid', name: 'Acid, Fat & Balance', icon: 'lemon', tier: 'beginner', requires: ['ck.salt'], state: lock, percent: 0, xp: 1700,
      desc: 'Something sharp to lift richness, and enough fat to carry flavor. A dish that tastes heavy or dull is usually one squeeze of lemon or a spoon of vinegar from being finished.' },
    { id: 'ck.mise', name: 'Preparation', icon: 'mise', tier: 'beginner', requires: ['ck.knife'], state: lock, percent: 0, xp: 1300,
      desc: 'Everything chopped and to hand before the pan goes on. It looks fussy and it is what stops the garlic burning while you are still peeling the onion.' },
    { id: 'ck.eggs', name: 'Eggs', icon: 'egg', tier: 'beginner', requires: ['ck.heat'], state: lock, percent: 0, xp: 1400,
      desc: 'Scrambled, fried, boiled and folded, which are four exercises in gentle heat. They are cheap, fast and unforgiving, which makes them the best practice available.' },
    { id: 'ck.veg', name: 'Vegetables', icon: 'vegetable', tier: 'beginner', requires: ['ck.mise'], state: lock, percent: 0, xp: 1500,
      desc: 'Roasting, steaming, sauteing and knowing what each does to texture and sweetness. Most people undercook roasted vegetables by ten minutes and underseason them throughout.' },
    { id: 'ck.starch', name: 'Rice, Pasta & Potatoes', icon: 'grain', tier: 'beginner', requires: ['ck.veg'], state: lock, percent: 0, xp: 1500,
      desc: 'The base of most cheap meals, each with one thing that matters: ratio, salted water, and starting potatoes cold. Getting those three right covers an enormous amount of ground.' },
    { id: 'ck.protein', name: 'Meat, Fish & Alternatives', icon: 'protein-food', tier: 'intermediate', core: true, requires: ['ck.acid'], state: lock, percent: 0, xp: 1900,
      desc: 'Dry surface, hot pan, do not move it, and rest it afterwards. Cooking to temperature rather than to time is the single change that most improves results.' },
    { id: 'ck.sauce', name: 'Sauces', icon: 'sauce', tier: 'intermediate', requires: ['ck.protein'], state: lock, percent: 0, xp: 1900,
      desc: 'Deglazing a pan, emulsifying, and thickening without lumps. A handful of mother sauces underlie hundreds of dishes, and the pan you just cooked in is where most of them start.' },
    { id: 'ck.soup', name: 'Soups, Stews & Braises', icon: 'pot', tier: 'intermediate', requires: ['ck.sauce'], state: lock, percent: 0, xp: 1800,
      desc: 'Slow, forgiving cooking that turns cheap cuts and old vegetables into the best meals in the repertoire. Brown properly first; the difference between a browned base and a boiled one is enormous.' },
    { id: 'ck.spice', name: 'Herbs & Spices', icon: 'spices', tier: 'intermediate', requires: ['ck.acid'], state: lock, percent: 0, xp: 1700,
      desc: 'Which go in early, which at the end, and why blooming whole spices in fat changes them. Hardy herbs cook and delicate ones are stirred in off the heat.' },
    { id: 'ck.bake', name: 'Baking', icon: 'bread', tier: 'advanced', requires: ['ck.starch'], state: lock, percent: 0, xp: 2000,
      desc: 'Chemistry with a timer, where measuring by weight actually matters. Bread rewards patience and temperature control more than technique, and the first several loaves are supposed to be dense.' },
    { id: 'ck.batch', name: 'Batch Cooking', icon: 'meal-prep', tier: 'advanced', requires: ['ck.soup'], state: lock, percent: 0, xp: 1800,
      desc: 'Cooking once and eating three times, with things that improve rather than degrade. It is the single most effective habit for eating well during a busy week.' },
    { id: 'ck.plan', name: 'Meal Planning', icon: 'meal-plan', tier: 'advanced', requires: ['ck.batch'], state: lock, percent: 0, xp: 1800,
      desc: 'Deciding the week before shopping, with meals that share ingredients. It cuts waste, cost and the daily question of what to eat, which is the expensive part.' },
    { id: 'ck.leftovers', name: 'Leftovers & Waste', icon: 'leftovers', tier: 'advanced', requires: ['ck.plan'], state: lock, percent: 0, xp: 1700,
      desc: 'Turning what is left into something that is not obviously yesterday. Fried rice, soup and a frittata will absorb almost anything in a fridge.' },
    { id: 'ck.safety', name: 'Food Safety', icon: 'food-safety', tier: 'advanced', requires: ['ck.protein'], state: lock, percent: 0, xp: 1600,
      desc: 'Temperatures, separate boards and how long things actually keep. Unglamorous, occasionally the most important node on this tree.' },
    { id: 'ck.improvise', name: 'Cooking Without a Recipe', icon: 'improvise', tier: 'expert', requires: ['ck.spice', 'ck.leftovers', 'ck.sauce'], state: lock, percent: 0, xp: 2400,
      desc: 'Opening the fridge and building something from what is there. It arrives once technique replaces instructions, and it is the point at which cooking stops being a chore.' },
    { id: 'ck.feed', name: 'Cooking for People', icon: 'feast', tier: 'mastery', requires: ['ck.improvise', 'ck.bake', 'ck.safety'], state: lock, percent: 0, xp: 2800,
      desc: 'Several dishes finishing at once, for more people than usual, while remaining good company. Timing is the whole skill, and it is learned by getting it wrong in front of friends.' },
  ],
};
