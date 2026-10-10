/**
 * Competitive Robotics — a branch of Coding.
 *
 * FRC, VEX and the build-season shape: a game announced in January, a robot
 * that has to exist by a bag date, and matches where the best machine on the
 * field routinely loses to the one that never stops working.
 *
 * ## Why it is under Coding and only half about code
 *
 * The catalogue files Robotics under Computing, and the routing follows the
 * catalogue. But the lattice does not pretend the subject is software: three
 * of its five chains are mechanical, electrical and organisational, and a team
 * whose autonomous routine is beautiful and whose drivetrain sheds a wheel in
 * quarter-finals has learned the wrong lesson from a season.
 *
 * ## Safety is the root, and that is not ceremony
 *
 * Every other node on this tree involves a tool, a battery or a machine that
 * can take a finger off. It is the one root because it genuinely gates the
 * rest — a shop that will not let you near the mill is a hard prerequisite,
 * not a nice-to-have.
 *
 * ## The season is a mastery node
 *
 * Not because it is the hardest thing here, but because it is the thing that
 * requires all of it at once and on a deadline nobody controls.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ROBOTICS: SubjectTree = {
  id: 'robotics',
  title: 'Competitive Robotics',
  blurb: 'FRC and VEX — build season, and the robot that never stops working.',
  parent: 'coding',
  nodes: [
    { id: 'ro.safety', name: 'Shop Safety', icon: 'safety', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'Eye protection, tethered tools, and knowing which machines you are checked out on. It is the root of this tree because every node under it involves something that can injure you or destroy the robot.' },
    { id: 'ro.mech', name: 'Mechanisms', icon: 'rotation', tier: 'foundation', core: true, requires: ['ro.safety'], state: lock, percent: 0, xp: 1400,
      desc: 'Gears, belts, linkages and the trade between speed and torque that every one of them makes. Most first-year design failures are a mechanism asked to do a job a different mechanism does easily.' },
    { id: 'ro.power', name: 'Power & Batteries', icon: 'battery', tier: 'foundation', requires: ['ro.safety'], state: lock, percent: 0, xp: 1300,
      desc: 'What a match actually draws, why voltage sags under load, and what a brownout does to a match you were winning. Teams lose more matches to power management than to any single mechanical failure.' },
    { id: 'ro.circuit', name: 'Wiring', icon: 'circuit', tier: 'beginner', requires: ['ro.power'], state: lock, percent: 0, xp: 1500,
      desc: 'Gauge, fusing, strain relief and connectors that survive being hit. A wiring job that works on the bench and fails on impact is the most expensive kind, because it fails intermittently at competition.' },
    { id: 'ro.cad', name: 'CAD', icon: 'form-3d', tier: 'beginner', core: true, requires: ['ro.mech'], state: lock, percent: 0, xp: 1600,
      desc: 'Designing the thing before cutting it, and discovering the interference on a screen rather than in aluminum. A full-robot assembly is what tells you two subsystems want the same eight cubic inches.' },
    { id: 'ro.materials', name: 'Materials & Fabrication', icon: 'materials', tier: 'beginner', requires: ['ro.cad'], state: lock, percent: 0, xp: 1600,
      desc: 'What each stock shape is good at, what your shop can actually cut, and the tolerances you can hold. Designing a part nobody on the team can make is a design failure rather than a manufacturing one.' },
    { id: 'ro.proto', name: 'Prototyping', icon: 'prototype', tier: 'intermediate', core: true, requires: ['ro.materials'], state: lock, percent: 0, xp: 1700,
      desc: 'Building the ugly version out of wood and tape to answer one question, then throwing it away. Weeks of argument about whether an intake will work are settled in an afternoon by a prototype nobody was precious about.' },
    { id: 'ro.drive', name: 'Drivetrains', icon: 'motion', tier: 'intermediate', core: true, requires: ['ro.mech', 'ro.power'], state: lock, percent: 0, xp: 1800,
      desc: 'The one subsystem that matters in every match regardless of the game. Tank, mecanum and swerve trade capability against complexity, and a reliable simple drive beats an ambitious one that is still being fixed on Friday.' },
    { id: 'ro.sensors', name: 'Sensors', icon: 'gauge', tier: 'intermediate', requires: ['ro.circuit'], state: lock, percent: 0, xp: 1700,
      desc: 'Encoders, gyros and limit switches — the robot finding out where it actually is rather than where it was told to go. Every one of them is noisy, and treating a reading as truth is how mechanisms get destroyed.' },
    { id: 'ro.code', name: 'Robot Code', icon: 'automation', tier: 'intermediate', requires: ['ro.sensors'], state: lock, percent: 0, xp: 1900,
      desc: 'Subsystems, commands and a loop that must never block. Code that is fine in a unit test and stalls the main loop for forty milliseconds is code that makes the robot unsteerable.' },
    { id: 'ro.docs', name: 'Engineering Notebook', icon: 'lab-notebook', tier: 'intermediate', requires: ['ro.proto'], state: lock, percent: 0, xp: 1600,
      desc: 'Recording what was tried, what it measured and why the decision went the way it did — as you go, not the week before judging. It is separately awarded, and it is the only thing that survives a graduating team.' },
    { id: 'ro.control', name: 'Feedback Control', icon: 'control-var', tier: 'advanced', core: true, requires: ['ro.sensors', 'ro.code'], state: lock, percent: 0, xp: 2200,
      desc: 'Closing the loop so a mechanism reaches a setpoint and stays there under load. PID is four lines and two weeks of tuning, and understanding what each term answers for is what shortens the two weeks.' },
    { id: 'ro.auto', name: 'Autonomous Routines', icon: 'loops', tier: 'advanced', requires: ['ro.control', 'ro.drive'], state: lock, percent: 0, xp: 2300,
      desc: 'Fifteen seconds with no driver, where dead reckoning drifts and the field is never quite where the drawing said. A short routine that works every time outscores an ambitious one that works at home.' },
    { id: 'ro.vision', name: 'Computer Vision', icon: 'camera', tier: 'advanced', requires: ['ro.code'], state: lock, percent: 0, xp: 2300,
      desc: 'Finding a target in a camera frame and turning that into a heading, under venue lighting nobody warned you about. Latency is the constraint that surprises teams — a perfect pose estimate arriving late is a wrong one.' },
    { id: 'ro.strategy', name: 'Match Strategy', icon: 'strategy', tier: 'advanced', core: true, requires: ['ro.drive'], state: lock, percent: 0, xp: 2100,
      desc: 'Reading the game manual for where the points actually are, and designing for a role rather than for everything. Most rookie robots attempt every scoring method and are mediocre at all of them.' },
    { id: 'ro.scout', name: 'Scouting & Data', icon: 'analytics', tier: 'expert', requires: ['ro.strategy'], state: lock, percent: 0, xp: 2400,
      desc: 'Recording what every robot at the event can do, so alliance selection is a decision rather than a reputation contest. The teams that win districts are usually the ones whose scouting data was trusted.' },
    { id: 'ro.pit', name: 'Pit & Repair', icon: 'repair', tier: 'expert', requires: ['ro.proto', 'ro.circuit'], state: lock, percent: 0, xp: 2300,
      desc: 'Diagnosing and fixing between matches, with six minutes and a queue. Spare parts made during build season and a robot designed to be taken apart are what turn a broken gearbox into a missed match rather than a lost event.' },
    { id: 'ro.comp', name: 'Competition Season', icon: 'trophy', tier: 'mastery', requires: ['ro.auto', 'ro.vision', 'ro.scout', 'ro.pit', 'ro.docs'], state: lock, percent: 0, xp: 3200,
      desc: 'Six weeks to a bag date and then an event that tests all of it at once. The robot that wins is rarely the most capable one on the field — it is the one that played every match it was scheduled for.' },
  ],
};
