/**
 * Electronics, a branch of Competitive Robotics.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ELECTRONICS: SubjectTree = {
  id: 'electronics',
  title: 'Electronics',
  blurb: 'Circuits, chips and building gadgets that work.',
  parent: 'robotics',
  nodes: [
    { id: 'el.safety', name: 'Electrical Safety', icon: 'warning', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Low voltage only, no wall outlets and never short a battery. Lithium batteries can catch fire if you abuse them.' },
    { id: 'el.basics', name: 'Voltage, Current & Resistance', icon: 'battery', tier: 'foundation', requires: ['el.safety'], state: lock, percent: 0, xp: 1200,
      desc: 'The three quantities behind every circuit. Picturing water flowing through pipes gets you started.' },
    { id: 'el.ohm', name: "Ohm's Law", icon: 'equations', tier: 'beginner', core: true, requires: ['el.basics'], state: lock, percent: 0, xp: 1600,
      desc: 'V equals I times R, and you will use it constantly. If you know any two values, you can find the third.' },
    { id: 'el.breadboard', name: 'Breadboards', icon: 'grid', tier: 'beginner', requires: ['el.basics'], state: lock, percent: 0, xp: 1700,
      desc: 'Building circuits without soldering anything. Learn which holes connect underneath before you plug in parts.' },
    { id: 'el.series', name: 'Series & Parallel', icon: 'circuit', tier: 'beginner', requires: ['el.ohm'], state: lock, percent: 0, xp: 1400,
      desc: 'How resistors and batteries combine. Holiday lights and house wiring use different setups for a reason.' },
    { id: 'el.meter', name: 'Using a Multimeter', icon: 'gauge', tier: 'intermediate', requires: ['el.breadboard'], state: lock, percent: 0, xp: 1800,
      desc: 'Checking voltage, current and continuity. Most debugging starts with a meter in your hand.' },
    { id: 'el.parts', name: 'Components', icon: 'toolbox', tier: 'intermediate', requires: ['el.series'], state: lock, percent: 0, xp: 1900,
      desc: 'LEDs, capacitors, diodes, transistors and switches. Read the datasheet before you plug something in.' },
    { id: 'el.solder', name: 'Soldering', icon: 'heat', tier: 'intermediate', requires: ['el.breadboard'], state: lock, percent: 0, xp: 2000,
      desc: 'Making permanent joints that are shiny and solid. Heat the pad and let the solder flow onto it.' },
    { id: 'el.arduino', name: 'Arduino Basics', icon: 'kernel', tier: 'intermediate', core: true, requires: ['el.parts'], state: lock, percent: 0, xp: 1700,
      desc: "Programming a microcontroller to blink, read and react. It's where code meets the real world." },
    { id: 'el.sensors', name: 'Sensors', icon: 'thermometer', tier: 'advanced', requires: ['el.arduino'], state: lock, percent: 0, xp: 2100,
      desc: 'Light, temperature, distance and motion sensors. Analog readings almost always need calibrating.' },
    { id: 'el.motors', name: 'Motors & Drivers', icon: 'automation', tier: 'advanced', requires: ['el.arduino', 'el.parts'], state: lock, percent: 0, xp: 2200,
      desc: 'DC, servo and stepper motors. A motor needs more current than a pin can give, so use a driver.' },
    { id: 'el.power', name: 'Power Supplies', icon: 'energy', tier: 'advanced', requires: ['el.motors'], state: lock, percent: 0, xp: 2300,
      desc: 'Batteries, regulators and keeping voltages steady. Power dips cause the weirdest bugs.' },
    { id: 'el.logic', name: 'Digital Logic', icon: 'boolean', tier: 'advanced', requires: ['el.arduino'], state: lock, percent: 0, xp: 2000,
      desc: 'Logic gates, binary and how computers work at the lowest level. Everything digital is built from these.' },
    { id: 'el.comm', name: 'Talking Between Chips', icon: 'message', tier: 'expert', requires: ['el.sensors', 'el.logic'], state: lock, percent: 0, xp: 2400,
      desc: 'Serial, I2C and SPI, the ways chips pass data around. Most sensors you buy speak one of these three.' },
    { id: 'el.pcb', name: 'Designing a PCB', icon: 'layers', tier: 'expert', requires: ['el.solder', 'el.power'], state: lock, percent: 0, xp: 2500,
      desc: 'Turning a breadboard into a printed circuit board. Free tools like KiCad put this in reach for students.' },
    { id: 'el.debug', name: 'Debugging Circuits', icon: 'debugging', tier: 'expert', core: true, requires: ['el.meter', 'el.comm'], state: lock, percent: 0, xp: 2600,
      desc: 'Checking power, ground and one thing at a time. Loose wires cause a lot of mystery bugs.' },
    { id: 'el.gadget', name: 'Build a Gadget', icon: 'invention', tier: 'mastery', requires: ['el.pcb', 'el.debug'], state: lock, percent: 0, xp: 2600,
      desc: 'A full project from idea to working device. Science fairs and robotics teams love these.' },
  ],
};
