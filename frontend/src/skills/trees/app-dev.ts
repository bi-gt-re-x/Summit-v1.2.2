/**
 * App Development, a branch of Web Development.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const APP_DEV: SubjectTree = {
  id: 'app-dev',
  title: 'App Development',
  blurb: 'Building apps for the phone in your pocket.',
  parent: 'web',
  nodes: [
    { id: 'apd.idea', name: 'App Ideas', icon: 'idea', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Solving a small problem you or your friends actually have. A homework tracker for your school is a great start.' },
    { id: 'apd.platform', name: 'Picking a Platform', icon: 'tablet', tier: 'foundation', requires: ['apd.idea'], state: lock, percent: 0, xp: 1200,
      desc: 'iOS, Android or both at once with React Native or Flutter. Cross-platform lets you reach everyone with one codebase.' },
    { id: 'apd.setup', name: 'Dev Setup', icon: 'toolbox', tier: 'beginner', requires: ['apd.platform'], state: lock, percent: 0, xp: 1600,
      desc: 'Installing tools and simulators, then running on your own phone. Expect setup to eat a full afternoon.' },
    { id: 'apd.screens', name: 'Building Screens', icon: 'layout', tier: 'beginner', core: true, requires: ['apd.setup'], state: lock, percent: 0, xp: 1700,
      desc: 'Layouts, buttons, text and images. Design for thumbs, small screens and people in a hurry.' },
    { id: 'apd.nav', name: 'Navigation', icon: 'routing', tier: 'beginner', requires: ['apd.screens'], state: lock, percent: 0, xp: 1400,
      desc: 'Tabs, stacks and moving between screens. Keep it simple so nobody ever feels lost.' },
    { id: 'apd.state', name: 'App State', icon: 'client-state', tier: 'intermediate', core: true, requires: ['apd.screens'], state: lock, percent: 0, xp: 1800,
      desc: 'Keeping track of data as people tap around. Most bugs come from state getting out of sync.' },
    { id: 'apd.lists', name: 'Lists & Scrolling', icon: 'arrays', tier: 'intermediate', requires: ['apd.state'], state: lock, percent: 0, xp: 1900,
      desc: "Showing long lists without lag. Virtualized lists only draw what's on screen right now." },
    { id: 'apd.storage', name: 'Saving Data', icon: 'database', tier: 'intermediate', requires: ['apd.state'], state: lock, percent: 0, xp: 2000,
      desc: 'Storing data on the device so it survives closing the app. Plan for the app getting killed at any moment.' },
    { id: 'apd.api', name: 'Talking to APIs', icon: 'api', tier: 'intermediate', requires: ['apd.state'], state: lock, percent: 0, xp: 1700,
      desc: 'Fetching data from the internet and dealing with slow connections. Always show loading and error states.' },
    { id: 'apd.auth', name: 'Sign-In', icon: 'auth', tier: 'advanced', requires: ['apd.api'], state: lock, percent: 0, xp: 2100,
      desc: 'Accounts, passwords and signing in with Google or Apple. Use a trusted service instead of building your own.' },
    { id: 'apd.design', name: 'Mobile Design', icon: 'design-system', tier: 'advanced', requires: ['apd.nav', 'apd.lists'], state: lock, percent: 0, xp: 2200,
      desc: 'Platform conventions, touch targets and dark mode. People expect apps to feel at home on their phone.' },
    { id: 'apd.device', name: 'Camera, GPS & Sensors', icon: 'camera', tier: 'advanced', requires: ['apd.storage'], state: lock, percent: 0, xp: 2300,
      desc: 'Using phone hardware with permissions. Explain why you need access before you ask for it.' },
    { id: 'apd.notify', name: 'Notifications', icon: 'notification-off', tier: 'advanced', requires: ['apd.api'], state: lock, percent: 0, xp: 2000,
      desc: 'Push and local notifications. Send too many and people turn them all off, then delete the app.' },
    { id: 'apd.a11y', name: 'Accessible Apps', icon: 'accessibility', tier: 'expert', requires: ['apd.design'], state: lock, percent: 0, xp: 2400,
      desc: 'Screen readers, text size and contrast. Accessible apps work better for everyone.' },
    { id: 'apd.test', name: 'Testing on Real Phones', icon: 'coverage', tier: 'expert', core: true, requires: ['apd.design', 'apd.auth'], state: lock, percent: 0, xp: 2500,
      desc: 'Trying old phones, small screens and slow networks. Simulators hide a lot of problems.' },
    { id: 'apd.release', name: 'App Store Release', icon: 'publish', tier: 'expert', requires: ['apd.test', 'apd.a11y'], state: lock, percent: 0, xp: 2600,
      desc: "Developer accounts, screenshots, review rules and launch day. Your first submission may get rejected, and that's normal." },
    { id: 'apd.grow', name: 'Growing & Updating', icon: 'growth-curve', tier: 'mastery', requires: ['apd.release', 'apd.notify', 'apd.device'], state: lock, percent: 0, xp: 2600,
      desc: 'Reading reviews, fixing crashes and shipping updates. Apps are never really finished.' },
  ],
};
