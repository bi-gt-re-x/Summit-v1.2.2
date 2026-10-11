/**
 * AI Tools, a branch of Studying.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const AI_TOOLS: SubjectTree = {
  id: 'ai-tools',
  title: 'AI Tools',
  blurb: 'Using AI to learn more, without letting it do your thinking.',
  parent: 'study',
  nodes: [
    { id: 'ai.how', name: 'How AI Chatbots Work', icon: 'neural-net', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "They predict likely words from patterns in text. That's why they can sound sure and still be wrong." },
    { id: 'ai.rules', name: "Your School's AI Rules", icon: 'permission', tier: 'foundation', requires: ['ai.how'], state: lock, percent: 0, xp: 1200,
      desc: 'Every class and teacher sets their own policy. Check the syllabus and ask when it seems unclear.' },
    { id: 'ai.prompt', name: 'Asking Good Questions', icon: 'question', tier: 'beginner', requires: ['ai.how'], state: lock, percent: 0, xp: 1600,
      desc: 'Giving context, a clear task and the format you want. Better prompts get better answers.' },
    { id: 'ai.honesty', name: 'Academic Honesty', icon: 'trust', tier: 'beginner', core: true, requires: ['ai.rules'], state: lock, percent: 0, xp: 1700,
      desc: "Turning in AI writing as your own is cheating, even when it's easy. Use it to learn, then do the work yourself." },
    { id: 'ai.tutor', name: 'AI as a Tutor', icon: 'coaching', tier: 'beginner', core: true, requires: ['ai.prompt', 'ai.honesty'], state: lock, percent: 0, xp: 1400,
      desc: 'Asking it to explain, quiz you or check your steps. Ask for hints before answers so you still do the thinking.' },
    { id: 'ai.check', name: 'Fact-Checking AI', icon: 'magnifier', tier: 'intermediate', core: true, requires: ['ai.prompt'], state: lock, percent: 0, xp: 1800,
      desc: 'Checking claims, numbers and sources against real references. AI makes up citations, so look up every one.' },
    { id: 'ai.quiz', name: 'Making Practice Questions', icon: 'flashcards', tier: 'intermediate', requires: ['ai.tutor'], state: lock, percent: 0, xp: 1900,
      desc: 'Turning your notes into flashcards or practice tests. Testing yourself is one of the best ways to study.' },
    { id: 'ai.feedback', name: 'Feedback on Drafts', icon: 'feedback', tier: 'intermediate', requires: ['ai.tutor'], state: lock, percent: 0, xp: 2000,
      desc: 'Asking for comments on clarity and structure while you do the rewriting. Keep your own voice.' },
    { id: 'ai.explain', name: 'Explaining Hard Topics', icon: 'explain', tier: 'intermediate', requires: ['ai.tutor'], state: lock, percent: 0, xp: 1700,
      desc: 'Asking for simpler explanations, analogies or examples. Then explain it back in your own words to see if it stuck.' },
    { id: 'ai.research', name: 'Research With AI', icon: 'search-engine', tier: 'advanced', requires: ['ai.check'], state: lock, percent: 0, xp: 2100,
      desc: "Using AI to find search terms and summarize what you've read. Always go to the real source before citing anything." },
    { id: 'ai.cite', name: 'Citing AI Use', icon: 'citation', tier: 'advanced', requires: ['ai.research', 'ai.honesty'], state: lock, percent: 0, xp: 2200,
      desc: 'Saying how you used AI when your class allows it. MLA and APA both have formats for it.' },
    { id: 'ai.code', name: 'AI for Coding Homework', icon: 'terminal', tier: 'advanced', requires: ['ai.explain'], state: lock, percent: 0, xp: 2300,
      desc: "Using it to explain errors and concepts. If you can't write it again without help, you didn't learn it." },
    { id: 'ai.privacy', name: 'Privacy & Your Data', icon: 'vault', tier: 'advanced', requires: ['ai.check'], state: lock, percent: 0, xp: 2000,
      desc: "What happens to everything you type in. Don't share personal info or other people's work." },
    { id: 'ai.limits', name: 'Knowing the Limits', icon: 'warning', tier: 'expert', requires: ['ai.code', 'ai.research'], state: lock, percent: 0, xp: 2400,
      desc: 'Spotting confident wrong answers, bias and old info. The better you know a topic, the easier mistakes are to catch.' },
    { id: 'ai.workflow', name: 'A Study Workflow', icon: 'pipeline', tier: 'expert', requires: ['ai.quiz', 'ai.feedback', 'ai.limits'], state: lock, percent: 0, xp: 2500,
      desc: 'A routine where AI helps you plan, quiz and review while you do the real work. It should make you sharper.' },
    { id: 'ai.future', name: 'AI and Your Future', icon: 'horizon', tier: 'mastery', requires: ['ai.workflow', 'ai.privacy'], state: lock, percent: 0, xp: 2900,
      desc: 'How these tools are changing jobs and school. The skills that last are judgment, clear writing and knowing your stuff.' },
  ],
};
