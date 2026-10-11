/**
 * Internships, a branch of Work & Career.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const INTERNSHIPS: SubjectTree = {
  id: 'internships',
  title: 'Internships',
  blurb: 'Landing one, doing great work and turning it into what comes next.',
  parent: 'career',
  nodes: [
    { id: 'in.what', name: 'What Internships Are', icon: 'question', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Short-term work to learn about a field. Paid, unpaid, research and virtual ones all count.' },
    { id: 'in.find', name: 'Finding Openings', icon: 'search-engine', tier: 'foundation', requires: ['in.what'], state: lock, percent: 0, xp: 1200,
      desc: 'Counselors, summer programs, LinkedIn and cold emails. High school internships often come through people you know.' },
    { id: 'in.resume', name: 'Resume & Cover Letter', icon: 'resume', tier: 'beginner', requires: ['in.what'], state: lock, percent: 0, xp: 1600,
      desc: "Tailoring both to each opening. Mention the company's actual work so it doesn't read like a form letter." },
    { id: 'in.cold', name: 'Cold Emailing', icon: 'email', tier: 'beginner', requires: ['in.find'], state: lock, percent: 0, xp: 1700,
      desc: "Short, polite emails to professors or companies. Say who you are, why them and what you're asking for." },
    { id: 'in.linkedin', name: 'LinkedIn Profile', icon: 'network', tier: 'beginner', requires: ['in.resume'], state: lock, percent: 0, xp: 1400,
      desc: 'A photo, a headline and a short summary. Connect with the people you meet along the way.' },
    { id: 'in.apply', name: 'Applying', icon: 'apply', tier: 'intermediate', core: true, requires: ['in.resume', 'in.cold'], state: lock, percent: 0, xp: 1800,
      desc: "Applying widely and keeping a tracker. Expect plenty of no's, so cast a wide net." },
    { id: 'in.interview', name: 'Internship Interviews', icon: 'interview', tier: 'intermediate', requires: ['in.apply'], state: lock, percent: 0, xp: 1900,
      desc: 'Behavioral questions with the STAR method, plus your own questions for them. Research the company first.' },
    { id: 'in.tech', name: 'Technical Interviews', icon: 'problem-set', tier: 'intermediate', requires: ['in.interview'], state: lock, percent: 0, xp: 2000,
      desc: 'Coding problems or case questions for some fields. Practice them out loud, since thinking aloud is part of the test.' },
    { id: 'in.start', name: 'Starting Strong', icon: 'onboard', tier: 'intermediate', core: true, requires: ['in.interview'], state: lock, percent: 0, xp: 1700,
      desc: 'Learning names, tools and expectations in week one. Ask lots of questions early, while it feels natural.' },
    { id: 'in.habits', name: 'Professional Habits', icon: 'reliable', tier: 'advanced', requires: ['in.start'], state: lock, percent: 0, xp: 2100,
      desc: 'Emails, meetings, dress code and deadlines. Act like a real employee from day one.' },
    { id: 'in.project', name: 'Owning a Project', icon: 'project', tier: 'advanced', requires: ['in.habits'], state: lock, percent: 0, xp: 2200,
      desc: 'Finishing something real you can talk about later. Ask for meaningful work if nobody offers it.' },
    { id: 'in.mentor', name: 'Finding a Mentor', icon: 'coaching', tier: 'advanced', requires: ['in.start'], state: lock, percent: 0, xp: 2300,
      desc: 'Someone who guides you during the internship and after. Ask for quick coffee chats with people on the team.' },
    { id: 'in.feedback', name: 'Asking for Feedback', icon: 'feedback', tier: 'advanced', requires: ['in.project'], state: lock, percent: 0, xp: 2000,
      desc: "Checking in at the midpoint so there's still time to improve. Ask what one thing you should do differently." },
    { id: 'in.network', name: 'Networking', icon: 'network-people', tier: 'expert', requires: ['in.mentor'], state: lock, percent: 0, xp: 2400,
      desc: 'Meeting people across the company, beyond your own team. Stay in touch after the internship ends.' },
    { id: 'in.present', name: 'Final Presentation', icon: 'presenting', tier: 'expert', requires: ['in.feedback', 'in.tech'], state: lock, percent: 0, xp: 2500,
      desc: 'Sharing what you did and what you learned. Show results with numbers when you can.' },
    { id: 'in.offer', name: 'Return Offers & References', icon: 'handshake', tier: 'mastery', requires: ['in.present', 'in.network', 'in.linkedin'], state: lock, percent: 0, xp: 2900,
      desc: 'Turning a good summer into an offer or a strong letter. Thank everyone who helped you.' },
  ],
};
