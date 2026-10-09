/**
 * Travel — a branch of Life & Home.
 *
 * Ordered by what actually goes wrong: money, documents and health at the top,
 * because a trip is ruined by an expired passport or an uninsured injury far
 * more often than by a badly chosen itinerary.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const TRAVEL: SubjectTree = {
  id: 'travel',
  title: 'Travel',
  blurb: 'Going somewhere, and coming back without needing a holiday from it.',
  parent: 'life',
  nodes: [
    { id: 'tr.why', name: 'Deciding the Trip', icon: 'compass', tier: 'foundation', core: true, state: open, percent: 25, xp: 1300,
      desc: 'What this trip is for — rest, seeing people, or seeing places — because those three want different plans. Trips that disappoint are usually ones asked to be all three at once.' },
    { id: 'tr.budget', name: 'Budgeting a Trip', icon: 'budget', tier: 'foundation', requires: ['tr.why'], state: lock, percent: 0, xp: 1400,
      desc: 'Transport, beds, food and the daily spending that nobody counts. The last one is where budgets are broken, and estimating it per day beats hoping.' },
    { id: 'tr.docs', name: 'Documents', icon: 'passport', tier: 'foundation', requires: ['tr.why'], state: lock, percent: 0, xp: 1400,
      desc: 'Passport validity, visas and the entry rules of the country you are actually landing in. Several countries require six months of remaining validity, which surprises people at check-in.' },
    { id: 'tr.book', name: 'Booking', icon: 'booking', tier: 'beginner', requires: ['tr.budget'], state: lock, percent: 0, xp: 1500,
      desc: 'Flights, trains and rooms, and what each is actually cancellable for. Flexibility costs money and is occasionally the best money in the whole trip.' },
    { id: 'tr.insure', name: 'Insurance & Health', icon: 'insurance', tier: 'beginner', core: true, requires: ['tr.docs'], state: lock, percent: 0, xp: 1600,
      desc: 'Cover that includes what you will actually do, plus vaccinations and any prescriptions in their original packaging. The scenario it exists for is rare and financially unbounded.' },
    { id: 'tr.pack', name: 'Packing', icon: 'suitcase', tier: 'beginner', requires: ['tr.book'], state: lock, percent: 0, xp: 1400,
      desc: 'Less than feels right, in a bag you can carry up stairs. Everybody wears roughly a third of what they bring, and almost everything can be bought where you are going.' },
    { id: 'tr.route', name: 'Planning the Route', icon: 'route', tier: 'beginner', requires: ['tr.book'], state: lock, percent: 0, xp: 1600,
      desc: 'How many places, and how long in each. Fewer stops for longer is the single most reliable improvement to a trip that people resist until they have done it once.' },
    { id: 'tr.transport', name: 'Getting Around', icon: 'transport', tier: 'intermediate', requires: ['tr.route'], state: lock, percent: 0, xp: 1600,
      desc: 'Local trains, buses, apps and what a taxi should cost. Working out the route from the airport before you land removes the most expensive decision of most trips.' },
    { id: 'tr.money', name: 'Money Abroad', icon: 'currency', tier: 'intermediate', requires: ['tr.transport'], state: lock, percent: 0, xp: 1600,
      desc: 'Cards that do not charge for being used, some local cash, and knowing where tipping is expected. Airport exchange desks are the worst rate you will be offered all trip.' },
    { id: 'tr.language', name: 'Language for Travel', icon: 'phrasebook', tier: 'intermediate', requires: ['tr.route'], state: lock, percent: 0, xp: 1500,
      desc: 'Twenty phrases and the willingness to use them badly. Greetings and thank you in the local language change how you are treated far out of proportion to the effort.' },
    { id: 'tr.customs', name: 'Local Customs', icon: 'culture', tier: 'intermediate', core: true, requires: ['tr.language'], state: lock, percent: 0, xp: 1700,
      desc: 'Dress, greetings, queueing, tipping and what is rude. Ten minutes of reading beforehand prevents most of the ways visitors cause offense without noticing.' },
    { id: 'tr.safety', name: 'Staying Safe', icon: 'safety', tier: 'intermediate', requires: ['tr.money'], state: lock, percent: 0, xp: 1700,
      desc: 'Copies of documents, sensible habits with valuables, and knowing the local emergency number. Most trouble is opportunistic and most of it is avoided by ordinary caution.' },
    { id: 'tr.food', name: 'Eating Away', icon: 'street-food', tier: 'advanced', requires: ['tr.customs'], state: lock, percent: 0, xp: 1600,
      desc: 'Finding food where locals eat, and knowing what is worth being careful about. Busy stalls with high turnover are usually safer than quiet restaurants with laminated menus.' },
    { id: 'tr.solo', name: 'Traveling Alone', icon: 'solo', tier: 'advanced', requires: ['tr.safety'], state: lock, percent: 0, xp: 1900,
      desc: 'Complete freedom and nobody to share the decisions or the dull evenings. Hostels, walking tours and eating at the bar are the standard ways of not spending a fortnight silent.' },
    { id: 'tr.group', name: 'Traveling with Others', icon: 'group-travel', tier: 'advanced', requires: ['tr.customs'], state: lock, percent: 0, xp: 1900,
      desc: 'Agreeing beforehand on money, pace and time apart. Almost every travel argument is one of those three, and all three are easier to settle at home.' },
    { id: 'tr.slow', name: 'Slow Travel', icon: 'slow-travel', tier: 'advanced', requires: ['tr.food'], state: lock, percent: 0, xp: 2000,
      desc: 'Staying long enough to have a routine somewhere. Weeks rather than days change the trip from looking at a place to briefly living in one.' },
    { id: 'tr.work', name: 'Working Away', icon: 'remote', tier: 'advanced', requires: ['tr.slow'], state: lock, percent: 0, xp: 2000,
      desc: 'Time zones, connectivity and the rules about where you are allowed to work. It is neither a holiday nor a normal week, and treating it as either is how both go badly.' },
    { id: 'tr.impact', name: 'Traveling Responsibly', icon: 'recycle', tier: 'expert', requires: ['tr.slow', 'tr.group'], state: lock, percent: 0, xp: 2100,
      desc: 'Where the money goes, what the trip costs in emissions, and what pressure it puts on the place. Fewer, longer trips and local spending are the two levers that matter most.' },
    { id: 'tr.mishap', name: 'When It Goes Wrong', icon: 'delay', tier: 'expert', requires: ['tr.solo', 'tr.work'], state: lock, percent: 0, xp: 2200,
      desc: 'Missed connections, lost bags and illness away from home. Knowing your rights, having the documents accessible and building slack into the schedule turns a disaster into a delay.' },
    { id: 'tr.return', name: 'Coming Home', icon: 'homecoming', tier: 'mastery', requires: ['tr.mishap', 'tr.impact'], state: lock, percent: 0, xp: 2700,
      desc: 'A buffer day, the washing done and the photographs actually looked at. The trip is finished properly here, and skipping it is why some holidays leave people more tired than before.' },
  ],
};
