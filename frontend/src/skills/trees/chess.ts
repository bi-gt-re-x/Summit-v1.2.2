/**
 * Chess, a branch of Life & Home.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CHESS: SubjectTree = {
  id: 'chess',
  title: 'Chess',
  blurb: 'Tactics, plans and tournament play.',
  parent: 'life',
  nodes: [
    { id: 'chs.moves', name: 'How the Pieces Move', icon: 'rook', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Every piece, plus castling, en passant and promotion. Learn the special moves early so they never surprise you.' },
    { id: 'chs.values', name: 'Piece Values', icon: 'balance-scale', tier: 'foundation', requires: ['chs.moves'], state: lock, percent: 0, xp: 1200,
      desc: "Pawn 1, knight and bishop 3, rook 5, queen 9. Don't trade down without a good reason." },
    { id: 'chs.opening', name: 'Opening Principles', icon: 'opening', tier: 'beginner', requires: ['chs.moves'], state: lock, percent: 0, xp: 1600,
      desc: 'Control the center, develop your pieces and castle early. Principles matter more than memorized lines.' },
    { id: 'chs.mates', name: 'Basic Checkmates', icon: 'target', tier: 'beginner', requires: ['chs.values'], state: lock, percent: 0, xp: 1700,
      desc: 'Queen and rook mates against a lone king. Practice until you can finish them fast.' },
    { id: 'chs.tactics', name: 'Tactics', icon: 'puzzle', tier: 'beginner', core: true, requires: ['chs.values'], state: lock, percent: 0, xp: 1400,
      desc: 'Forks, pins, skewers and discovered attacks. Doing puzzles every day is the fastest way to improve.' },
    { id: 'chs.blunders', name: 'Blunder Checking', icon: 'checklist', tier: 'beginner', requires: ['chs.tactics'], state: lock, percent: 0, xp: 1500,
      desc: 'Before every move, ask what your opponent is threatening. Most beginner games are lost to blunders.' },
    { id: 'chs.repertoire', name: 'Opening Repertoire', icon: 'songbook', tier: 'intermediate', requires: ['chs.opening'], state: lock, percent: 0, xp: 1900,
      desc: 'A few openings you know well as white and as black. Understand the ideas behind the moves.' },
    { id: 'chs.middlegame', name: 'Middlegame Plans', icon: 'strategy', tier: 'intermediate', core: true, requires: ['chs.tactics', 'chs.opening'], state: lock, percent: 0, xp: 2000,
      desc: 'Finding a plan when nothing is forced. The pawn structure usually tells you where to play.' },
    { id: 'chs.endgame', name: 'Endgames', icon: 'flag', tier: 'intermediate', requires: ['chs.mates'], state: lock, percent: 0, xp: 1700,
      desc: 'King and pawn endings, opposition and rook endings. Plenty of games get decided right here.' },
    { id: 'chs.pawns', name: 'Pawn Structure', icon: 'strata', tier: 'advanced', requires: ['chs.middlegame'], state: lock, percent: 0, xp: 2100,
      desc: "Doubled, isolated and passed pawns. Pawns can't move back, so think hard before you push." },
    { id: 'chs.calc', name: 'Calculation', icon: 'decision-tree', tier: 'advanced', requires: ['chs.blunders', 'chs.middlegame'], state: lock, percent: 0, xp: 2200,
      desc: 'Seeing several moves ahead clearly. Check forcing moves first, meaning checks, captures and threats.' },
    { id: 'chs.clock', name: 'Clock Management', icon: 'timer', tier: 'advanced', requires: ['chs.calc'], state: lock, percent: 0, xp: 2300,
      desc: 'Using your time wisely in rated games. Saving time is pointless if it costs you the position.' },
    { id: 'chs.analysis', name: 'Analyzing Your Games', icon: 'magnifier', tier: 'advanced', requires: ['chs.endgame', 'chs.calc'], state: lock, percent: 0, xp: 2000,
      desc: 'Going over every game you play, especially the losses. Find the exact moment it turned.' },
    { id: 'chs.positional', name: 'Positional Play', icon: 'positioning', tier: 'expert', requires: ['chs.pawns'], state: lock, percent: 0, xp: 2400,
      desc: 'Good and bad pieces, weak squares and open files. Small edges add up over a long game.' },
    { id: 'chs.tournaments', name: 'Tournament Play', icon: 'trophy', tier: 'expert', core: true, requires: ['chs.clock', 'chs.analysis'], state: lock, percent: 0, xp: 2500,
      desc: 'Notation, etiquette and rated games. Scholastic tournaments are a great place to start.' },
    { id: 'chs.masters', name: 'Studying Masters', icon: 'master-study', tier: 'expert', requires: ['chs.analysis'], state: lock, percent: 0, xp: 2600,
      desc: 'Playing through classic games move by move. Try to guess the next move before you look.' },
    { id: 'chs.club', name: 'Running a Chess Club', icon: 'friends', tier: 'mastery', requires: ['chs.tournaments', 'chs.positional', 'chs.masters', 'chs.repertoire'], state: lock, percent: 0, xp: 2600,
      desc: 'Starting or leading a club at school. Teaching others makes you a better player too.' },
  ],
};
