/**
 * Art History, a branch of Art & Design.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ART_HISTORY: SubjectTree = {
  id: 'art-history',
  title: 'Art History',
  blurb: 'Looking closely at art and the world that made it.',
  parent: 'art',
  nodes: [
    { id: 'ah.look', name: 'Looking Closely', icon: 'observe', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Describing what you see before deciding what it means. Spend a full minute with each piece before you judge it.' },
    { id: 'ah.formal', name: 'Formal Analysis', icon: 'composition', tier: 'foundation', requires: ['ah.look'], state: lock, percent: 0, xp: 1200,
      desc: 'Line, color, space and composition. Use these words to back up every claim you make about a work.' },
    { id: 'ah.context', name: 'Context', icon: 'context', tier: 'beginner', core: true, requires: ['ah.look'], state: lock, percent: 0, xp: 1600,
      desc: 'Who made it, when, for whom and why. The same object can mean very different things in a different setting.' },
    { id: 'ah.ancient', name: 'Ancient Art', icon: 'monument', tier: 'beginner', requires: ['ah.context'], state: lock, percent: 0, xp: 1700,
      desc: 'Egypt, Greece, Rome and early cultures around the world. Art served gods, rulers and the dead.' },
    { id: 'ah.global', name: 'Global Traditions', icon: 'globe', tier: 'beginner', requires: ['ah.context'], state: lock, percent: 0, xp: 1400,
      desc: 'Art from Africa, Asia, the Americas and the Pacific. AP Art History covers much more than Europe.' },
    { id: 'ah.medieval', name: 'Medieval Art', icon: 'iconography', tier: 'intermediate', requires: ['ah.ancient'], state: lock, percent: 0, xp: 1800,
      desc: 'Churches, illuminated manuscripts and Islamic art. Religion shaped almost everything people made.' },
    { id: 'ah.architecture', name: 'Architecture', icon: 'construction', tier: 'intermediate', requires: ['ah.ancient'], state: lock, percent: 0, xp: 1900,
      desc: 'Buildings as art and as power. Look at the plan, the materials and what the building was for.' },
    { id: 'ah.renaissance', name: 'The Renaissance', icon: 'perspective', tier: 'intermediate', core: true, requires: ['ah.medieval', 'ah.formal'], state: lock, percent: 0, xp: 2000,
      desc: 'Perspective, realism and new patrons with money to spend. Florence and Rome changed everything.' },
    { id: 'ah.symbols', name: 'Symbols & Iconography', icon: 'key-id', tier: 'intermediate', requires: ['ah.global', 'ah.medieval'], state: lock, percent: 0, xp: 1700,
      desc: 'Reading the symbols artists used on purpose. A lily, a skull or a color can carry a whole meaning.' },
    { id: 'ah.baroque', name: 'Baroque', icon: 'light', tier: 'advanced', requires: ['ah.renaissance'], state: lock, percent: 0, xp: 2100,
      desc: 'Drama, light and motion. Caravaggio and Bernini wanted you to feel something right away.' },
    { id: 'ah.modern', name: 'Modern Art', icon: 'shapes', tier: 'advanced', requires: ['ah.baroque'], state: lock, percent: 0, xp: 2200,
      desc: 'Impressionism through abstraction. Artists broke the rules on purpose to ask what art even is.' },
    { id: 'ah.contemporary', name: 'Contemporary Art', icon: 'spark', tier: 'advanced', requires: ['ah.modern'], state: lock, percent: 0, xp: 2300,
      desc: 'Art from the 1980s to today. The idea behind a work often matters as much as the object.' },
    { id: 'ah.compare', name: 'Comparing Works', icon: 'compare', tier: 'expert', requires: ['ah.symbols', 'ah.renaissance'], state: lock, percent: 0, xp: 2300,
      desc: 'Writing about two works side by side. It is a favorite AP essay type, so practice it often.' },
    { id: 'ah.museum', name: 'Museum Visits', icon: 'museum', tier: 'expert', requires: ['ah.contemporary'], state: lock, percent: 0, xp: 2400,
      desc: 'Seeing art in person and reading the wall labels with a critical eye. Size and texture will surprise you.' },
    { id: 'ah.essay', name: 'Art History Essays', icon: 'essay', tier: 'expert', core: true, requires: ['ah.compare', 'ah.architecture'], state: lock, percent: 0, xp: 2500,
      desc: 'A claim, visual evidence and context in every paragraph. Name specific details you can actually see.' },
    { id: 'ah.ap', name: 'AP Art History', icon: 'exam', tier: 'mastery', requires: ['ah.essay', 'ah.museum'], state: lock, percent: 0, xp: 2900,
      desc: 'The 250 required works plus essay practice. Learn the works in groups by theme and era.' },
  ],
};
