/**
 * School & College, a root.
 *
 * The Studying group's own root. Everything a student does that is about being a
 * student, rather than about one subject, starts here and branches out.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SCHOOL: SubjectTree = {
  id: 'school',
  title: 'School & College',
  blurb: 'Classes, grades, tests and what comes after them.',
  group: 'Studying',
  nodes: [
    { id: 'sch.syllabus', name: 'Reading the Syllabus', icon: 'source-doc', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Grading weights, due dates and late policies are all in there. Five minutes with it on day one saves you points all term.' },
    { id: 'sch.planner', name: 'Using a Planner', icon: 'calendar-block', tier: 'foundation', core: true, requires: ['sch.syllabus'], state: lock, percent: 0, xp: 1200,
      desc: "Every assignment written down the day you get it. Your brain is bad at remembering due dates, so don't make it try." },
    { id: 'sch.attend', name: 'Showing Up', icon: 'available', tier: 'foundation', requires: ['sch.syllabus'], state: lock, percent: 0, xp: 1300,
      desc: "Going to class, on time, with what you need. It's the easiest grade boost there is." },
    { id: 'sch.participate', name: 'Class Participation', icon: 'discussion', tier: 'beginner', requires: ['sch.attend'], state: lock, percent: 0, xp: 1700,
      desc: 'Asking and answering questions in class. Even one comment a day changes how teachers see you.' },
    { id: 'sch.teachers', name: 'Talking to Teachers', icon: 'conversation', tier: 'beginner', core: true, requires: ['sch.attend'], state: lock, percent: 0, xp: 1400,
      desc: "Emailing politely, going to office hours and asking for help early. Teachers want to help, but they can't read your mind." },
    { id: 'sch.homework', name: 'Homework Routine', icon: 'routine', tier: 'beginner', requires: ['sch.planner'], state: lock, percent: 0, xp: 1500,
      desc: "Same time, same place, phone away. A routine means you don't have to decide to start every night." },
    { id: 'sch.grades', name: 'Grades & GPA', icon: 'gauge', tier: 'beginner', requires: ['sch.syllabus'], state: lock, percent: 0, xp: 1600,
      desc: 'How your grade gets calculated and what each assignment is worth. Know your weighted GPA and what actually moves it.' },
    { id: 'sch.projects', name: 'Big Assignments', icon: 'milestone', tier: 'intermediate', requires: ['sch.homework'], state: lock, percent: 0, xp: 2000,
      desc: 'Breaking projects and papers into chunks with their own due dates. Starting early is the whole trick.' },
    { id: 'sch.groups', name: 'Group Projects', icon: 'friends', tier: 'intermediate', requires: ['sch.participate'], state: lock, percent: 0, xp: 1700,
      desc: 'Splitting the work, setting deadlines and handling the one who disappears. Write down who does what in the first meeting.' },
    { id: 'sch.tests', name: 'Test Days', icon: 'exam', tier: 'intermediate', core: true, requires: ['sch.homework'], state: lock, percent: 0, xp: 1800,
      desc: 'Sleep, breakfast, reading every question and checking your work. Small habits on test day can be worth a letter grade.' },
    { id: 'sch.bounce', name: 'Bouncing Back', icon: 'recovery', tier: 'intermediate', requires: ['sch.grades', 'sch.teachers'], state: lock, percent: 0, xp: 1900,
      desc: "Looking at what went wrong after a bad grade, asking about retakes and adjusting. One test doesn't define the class." },
    { id: 'sch.balance', name: 'School-Life Balance', icon: 'balance-food', tier: 'advanced', requires: ['sch.projects'], state: lock, percent: 0, xp: 2300,
      desc: 'Fitting in sports, jobs, friends and sleep. Protect sleep first, since everything else gets worse without it.' },
    { id: 'sch.courses', name: 'Choosing Classes', icon: 'choice', tier: 'advanced', requires: ['sch.grades'], state: lock, percent: 0, xp: 2000,
      desc: 'Picking a schedule that pushes you without burying you. Ask older students which classes really take the most time.' },
    { id: 'sch.advanced', name: 'AP, IB & Dual Enrollment', icon: 'skill-up', tier: 'advanced', requires: ['sch.courses'], state: lock, percent: 0, xp: 2100,
      desc: 'College-level classes in high school. They can earn credit, but only take what you can keep up with.' },
    { id: 'sch.recs', name: 'Recommendation Letters', icon: 'testimony', tier: 'expert', requires: ['sch.teachers', 'sch.participate'], state: lock, percent: 0, xp: 2500,
      desc: 'Asking teachers who know you well, early and with a brag sheet. Good letters come from relationships built over time.' },
    { id: 'sch.transition', name: 'High School to College', icon: 'graduation', tier: 'expert', requires: ['sch.advanced', 'sch.balance'], state: lock, percent: 0, xp: 2600,
      desc: 'Bigger classes, less structure and more freedom. The students who do best go to office hours and plan their weeks.' },
    { id: 'sch.own', name: 'Owning Your Education', icon: 'autodidact', tier: 'mastery', requires: ['sch.transition', 'sch.recs'], state: lock, percent: 0, xp: 2600,
      desc: 'Choosing what to learn and chasing it on your own. School hands you the tools, and you decide what to build.' },
    { id: 'sch.testprep', name: 'Test Prep', icon: 'problem-set', tier: 'intermediate', requires: ['sch.tests'], navTo: 'test-prep', state: lock,
      desc: 'Its own tree: SAT, ACT and AP exam prep, from your first practice test to test day.' },
    { id: 'sch.college', name: 'College Applications', icon: 'apply', tier: 'advanced', requires: ['sch.courses'], navTo: 'college-apps', state: lock,
      desc: 'Its own tree: building a list, the essays, recommendations and deciding where to go.' },
    { id: 'sch.aid', name: 'Financial Aid', icon: 'piggy-bank', tier: 'advanced', requires: ['sch.courses'], navTo: 'financial-aid', state: lock,
      desc: 'Its own tree: the FAFSA, scholarships, loans and reading an aid offer without getting fooled.' },
    { id: 'sch.ecs', name: 'Extracurriculars', icon: 'star', tier: 'beginner', requires: ['sch.balance'], navTo: 'extracurriculars', state: lock,
      desc: 'Its own tree: clubs, sports, service and leadership, and telling the story of what you did.' },
    { id: 'sch.premed', name: 'Pre-Med', icon: 'immune', tier: 'expert', requires: ['sch.advanced'], navTo: 'pre-med', state: lock,
      desc: 'Its own tree: the classes, clinical hours, MCAT and applications on the road to med school.' },
  ],
};
