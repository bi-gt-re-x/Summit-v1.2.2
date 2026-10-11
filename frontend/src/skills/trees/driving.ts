/**
 * Driving, a branch of Life & Home.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DRIVING: SubjectTree = {
  id: 'driving',
  title: 'Driving',
  blurb: "From learner's permit to driving safely on your own.",
  parent: 'life',
  nodes: [
    { id: 'dv.rules', name: 'Rules of the Road', icon: 'map', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "Signs, signals and right of way from your state's driver handbook. Everything on the permit test is in there." },
    { id: 'dv.permit', name: "Learner's Permit", icon: 'key-id', tier: 'foundation', requires: ['dv.rules'], state: lock, percent: 0, xp: 1200,
      desc: 'Studying, passing the written test and handling the paperwork. Bring every document the DMV lists.' },
    { id: 'dv.controls', name: 'Car Controls', icon: 'car', tier: 'beginner', requires: ['dv.permit'], state: lock, percent: 0, xp: 1600,
      desc: 'Mirrors, seat, pedals, lights and wipers. Adjust everything before you start the engine.' },
    { id: 'dv.basics', name: 'Starting & Stopping', icon: 'switch-cost', tier: 'beginner', core: true, requires: ['dv.controls'], state: lock, percent: 0, xp: 1700,
      desc: 'Smooth acceleration and braking in an empty parking lot. Smooth inputs feel safer for everyone in the car.' },
    { id: 'dv.steering', name: 'Steering & Turns', icon: 'rotation', tier: 'beginner', requires: ['dv.basics'], state: lock, percent: 0, xp: 1400,
      desc: 'Hand-over-hand turns and looking where you want to go. The car follows your eyes.' },
    { id: 'dv.scanning', name: 'Scanning & Mirrors', icon: 'vision', tier: 'intermediate', core: true, requires: ['dv.steering'], state: lock, percent: 0, xp: 1800,
      desc: 'Checking each mirror every few seconds and looking far ahead. See problems coming before they happen.' },
    { id: 'dv.parking', name: 'Parking', icon: 'grid', tier: 'intermediate', requires: ['dv.steering'], state: lock, percent: 0, xp: 1900,
      desc: 'Straight, angle and parallel parking. Practice with cones or trash cans before the road test.' },
    { id: 'dv.lanes', name: 'Lane Changes', icon: 'path-route', tier: 'intermediate', requires: ['dv.scanning'], state: lock, percent: 0, xp: 2000,
      desc: 'Signal, mirror, shoulder check, then move over. Never skip the shoulder check, ever.' },
    { id: 'dv.intersections', name: 'Intersections', icon: 'route', tier: 'intermediate', requires: ['dv.scanning'], state: lock, percent: 0, xp: 1700,
      desc: 'Stop signs, lights and left turns. Left turns cause a lot of teen crashes, so take your time.' },
    { id: 'dv.highway', name: 'Highway Driving', icon: 'race', tier: 'advanced', requires: ['dv.lanes'], state: lock, percent: 0, xp: 2100,
      desc: 'Merging, speed and following distance. Match the speed of traffic as you merge in.' },
    { id: 'dv.weather', name: 'Night & Bad Weather', icon: 'weather', tier: 'advanced', requires: ['dv.intersections'], state: lock, percent: 0, xp: 2200,
      desc: 'Rain, fog, snow and darkness. Slow down, turn on your lights and leave a lot of extra space.' },
    { id: 'dv.phone', name: 'No Distractions', icon: 'device-off', tier: 'advanced', requires: ['dv.scanning'], state: lock, percent: 0, xp: 2300,
      desc: 'Phone away, no texting and few passengers. The text can wait, and you only get one life.' },
    { id: 'dv.defensive', name: 'Defensive Driving', icon: 'shield', tier: 'expert', core: true, requires: ['dv.highway', 'dv.weather', 'dv.phone'], state: lock, percent: 0, xp: 2300,
      desc: 'Expecting other drivers to mess up and planning for it. Always leave yourself a way out.' },
    { id: 'dv.test', name: 'The Road Test', icon: 'exam', tier: 'expert', requires: ['dv.parking', 'dv.defensive'], state: lock, percent: 0, xp: 2400,
      desc: 'What examiners check and the most common fails. Rolling through a stop sign is a classic.' },
    { id: 'dv.care', name: 'Car Care', icon: 'repair', tier: 'expert', requires: ['dv.test'], state: lock, percent: 0, xp: 2500,
      desc: 'Gas, tire pressure, oil and warning lights. Know what to do when you get a flat.' },
    { id: 'dv.costs', name: 'Insurance & Costs', icon: 'insurance', tier: 'expert', requires: ['dv.care'], state: lock, percent: 0, xp: 2600,
      desc: 'Insurance, gas and repair costs add up. Good grades can lower teen insurance rates.' },
    { id: 'dv.incident', name: 'If Something Happens', icon: 'warning', tier: 'mastery', requires: ['dv.costs'], state: lock, percent: 0, xp: 2600,
      desc: 'What to do after a crash or when you get pulled over. Stay calm, stay safe and know what info to swap.' },
  ],
};
