/**
 * Java, a branch of Coding.
 *
 * Ordered along the AP CS A units, so the free-response questions sit near the end.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const JAVA: SubjectTree = {
  id: 'java',
  title: 'Java',
  blurb: 'Objects, types and everything on AP Computer Science A.',
  parent: 'coding',
  nodes: [
    { id: 'jv.setup', name: 'Java Setup', icon: 'terminal', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Installing the JDK and running a class with a main method. Java is strict, and that strictness catches bugs early.' },
    { id: 'jv.types', name: 'Primitive Types', icon: 'types', tier: 'foundation', requires: ['jv.setup'], state: lock, percent: 0, xp: 1200,
      desc: 'int, double, boolean and char. Integer division and casting trip up almost everyone at first.' },
    { id: 'jv.strings', name: 'Strings', icon: 'syntax', tier: 'beginner', requires: ['jv.types'], state: lock, percent: 0, xp: 1600,
      desc: 'String methods and why you compare with .equals. Using == on strings is a classic AP CS A trap.' },
    { id: 'jv.control', name: 'Conditionals & Loops', icon: 'loops', tier: 'beginner', core: true, requires: ['jv.types'], state: lock, percent: 0, xp: 1700,
      desc: 'if, while and for, plus boolean logic. Off-by-one errors live in your loop bounds.' },
    { id: 'jv.methods', name: 'Methods', icon: 'functions', tier: 'beginner', requires: ['jv.control'], state: lock, percent: 0, xp: 1400,
      desc: 'Parameters, return types and static methods. Breaking code into methods makes it easy to test.' },
    { id: 'jv.arrays', name: 'Arrays', icon: 'arrays', tier: 'intermediate', requires: ['jv.control'], state: lock, percent: 0, xp: 1800,
      desc: 'Fixed-size lists and walking through them. Know how to find a max, a sum and a count in one pass.' },
    { id: 'jv.classes', name: 'Writing Classes', icon: 'objects', tier: 'intermediate', core: true, requires: ['jv.methods', 'jv.strings'], state: lock, percent: 0, xp: 1900,
      desc: 'Fields, constructors and methods. A class is a blueprint, and objects are what you build from it.' },
    { id: 'jv.encap', name: 'Encapsulation', icon: 'vault', tier: 'intermediate', requires: ['jv.classes'], state: lock, percent: 0, xp: 2000,
      desc: 'Private fields with getters and setters. It keeps objects from getting changed in weird ways.' },
    { id: 'jv.arraylist', name: 'ArrayList', icon: 'linked-list', tier: 'intermediate', requires: ['jv.arrays', 'jv.classes'], state: lock, percent: 0, xp: 1700,
      desc: 'Resizable lists and removing items while looping. Removing while looping forward skips elements.' },
    { id: 'jv.grid', name: '2D Arrays', icon: 'grid', tier: 'advanced', requires: ['jv.arrays'], state: lock, percent: 0, xp: 2100,
      desc: 'Rows, columns and the nested loops that walk them. Row-major order shows up on every AP exam.' },
    { id: 'jv.inherit', name: 'Inheritance', icon: 'hierarchy', tier: 'advanced', core: true, requires: ['jv.encap'], state: lock, percent: 0, xp: 2200,
      desc: 'extends, super and overriding. A subclass gets everything the parent has, plus its own stuff.' },
    { id: 'jv.poly', name: 'Polymorphism', icon: 'shapes', tier: 'advanced', requires: ['jv.inherit'], state: lock, percent: 0, xp: 2300,
      desc: 'One reference type, many object types. Which method runs depends on the actual object.' },
    { id: 'jv.recursion', name: 'Recursion', icon: 'recursion', tier: 'advanced', requires: ['jv.methods'], state: lock, percent: 0, xp: 2000,
      desc: 'Methods that call themselves, with a base case to stop. Trace small examples by hand until it clicks.' },
    { id: 'jv.search', name: 'Searching & Sorting', icon: 'sorting', tier: 'expert', requires: ['jv.arraylist', 'jv.recursion'], state: lock, percent: 0, xp: 2400,
      desc: 'Linear and binary search, plus selection, insertion and merge sort. Know how each one works step by step.' },
    { id: 'jv.mcq', name: 'AP CS A Multiple Choice', icon: 'checklist', tier: 'expert', requires: ['jv.search', 'jv.poly'], state: lock, percent: 0, xp: 2500,
      desc: 'Tracing code by hand, quickly and without a computer. Write down the value of every variable as you go.' },
    { id: 'jv.frq', name: 'AP CS A Free Response', icon: 'exam', tier: 'expert', requires: ['jv.grid', 'jv.poly', 'jv.search'], state: lock, percent: 0, xp: 2600,
      desc: "Four handwritten coding questions. Practice writing Java on paper, since there's no compiler to help." },
    { id: 'jv.project', name: 'Java Projects', icon: 'project', tier: 'mastery', requires: ['jv.frq', 'jv.mcq'], state: lock, percent: 0, xp: 2600,
      desc: 'Games, apps and tools beyond the exam. Android apps and Minecraft mods both run on Java.' },
  ],
};
