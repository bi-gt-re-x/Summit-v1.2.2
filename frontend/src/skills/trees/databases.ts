/**
 * Databases — a branch of Coding.
 *
 * Modelling comes before querying here. Somebody who can write a clever join
 * over a badly shaped schema will keep writing clever joins forever; the tables
 * are what decides whether the questions are easy or hard to ask.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DATABASES: SubjectTree = {
  id: 'databases',
  title: 'Databases',
  blurb: 'Where the data lives, how it is shaped, and how to ask it things quickly.',
  parent: 'coding',
  nodes: [
    { id: 'db.what', name: 'What a Database Is', icon: 'database', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'A program whose whole job is storing data safely and answering questions about it faster than a file could. What you are buying over a folder of files is concurrent access, guarantees when things crash, and indexes.' },
    { id: 'db.tables', name: 'Tables & Rows', icon: 'table', tier: 'foundation', requires: ['db.what'], state: lock, percent: 0, xp: 1200,
      desc: 'A table is one kind of thing, a row is one of them, a column is one fact about it. Deciding what one row means before writing any SQL prevents most of the trouble that follows.' },
    { id: 'db.types', name: 'Column Types', icon: 'types', tier: 'foundation', requires: ['db.tables'], state: lock, percent: 0, xp: 1100,
      desc: 'Choosing what a column is allowed to hold, which is the cheapest validation there is. Dates stored as text and money stored as floating point are the two mistakes that are hardest to walk back later.' },
    { id: 'db.keys', name: 'Keys & Relationships', icon: 'key-id', tier: 'beginner', core: true, requires: ['db.tables'], state: lock, percent: 0, xp: 1600,
      desc: 'A primary key names a row uniquely and a foreign key points at one in another table. Together they are how a database stops holding the same fact in two places and starts holding it once.' },
    { id: 'db.select', name: 'Querying', icon: 'query', tier: 'beginner', requires: ['db.types'], state: lock, percent: 0, xp: 1700,
      desc: 'Asking for the rows and columns you want, filtered and sorted. SQL describes the result rather than the steps, which is the shift that makes it feel strange for about a week and obvious afterwards.' },
    { id: 'db.joins', name: 'Joins', icon: 'join', tier: 'beginner', requires: ['db.select', 'db.keys'], state: lock, percent: 0, xp: 1900,
      desc: 'Answering a question that spans two tables by matching rows on a key. Inner and outer differ only in what happens when there is no match, and that difference is usually the whole answer.' },
    { id: 'db.aggregate', name: 'Grouping & Aggregates', icon: 'aggregate', tier: 'beginner', requires: ['db.select'], state: lock, percent: 0, xp: 1600,
      desc: 'Collapsing many rows into counts, sums and averages per group. The rule that trips everyone once: filtering before grouping and filtering after it are different clauses and different questions.' },
    { id: 'db.normal', name: 'Normalization', icon: 'normalise', tier: 'intermediate', core: true, requires: ['db.joins'], state: lock, percent: 0, xp: 2000,
      desc: 'Splitting tables so each fact is stored exactly once. Third normal form is far enough for almost everything, and knowing the rules is what lets you break them deliberately later rather than by accident.' },
    { id: 'db.index', name: 'Indexes', icon: 'index', tier: 'intermediate', requires: ['db.select'], state: lock, percent: 0, xp: 1900,
      desc: 'A second structure that finds rows without reading the table. They make reads fast and writes slower, which is why indexing every column is not the answer even though it is tempting.' },
    { id: 'db.plan', name: 'Query Plans', icon: 'query-plan', tier: 'intermediate', requires: ['db.index', 'db.aggregate'], state: lock, percent: 0, xp: 2100,
      desc: 'What the engine decided to actually do with your query. Reading a plan turns "it is slow" into "it is scanning four million rows because this index does not cover the filter", which is a fixable statement.' },
    { id: 'db.constraint', name: 'Constraints', icon: 'constraint', tier: 'intermediate', requires: ['db.normal'], state: lock, percent: 0, xp: 1700,
      desc: 'Rules the database refuses to break — not null, unique, foreign key, check. Application code that enforces the same rules will eventually have a path that forgets; the database never does.' },
    { id: 'db.tx', name: 'Transactions', icon: 'transaction', tier: 'intermediate', core: true, requires: ['db.constraint'], state: lock, percent: 0, xp: 2200,
      desc: 'A group of changes that all happen or none do. The classic case is moving money between two rows, and the reason to care is that every system eventually crashes exactly between them.' },
    { id: 'db.isolation', name: 'Isolation Levels', icon: 'isolation', tier: 'advanced', requires: ['db.tx'], state: lock, percent: 0, xp: 2300,
      desc: 'How much two transactions running at once are allowed to see of each other. Each level trades a class of anomaly for throughput, and picking one is a decision about correctness, not performance.' },
    { id: 'db.migrate', name: 'Migrations', icon: 'migration', tier: 'advanced', requires: ['db.constraint'], state: lock, percent: 0, xp: 1900,
      desc: 'Changing the schema of a database that already has data and traffic in it. Every change wants a forward path and a way back, and the ones that lock a big table are the ones that take a site down.' },
    { id: 'db.views', name: 'Views & Procedures', icon: 'view', tier: 'advanced', requires: ['db.plan'], state: lock, percent: 0, xp: 1800,
      desc: 'A saved query that behaves like a table, and logic that runs inside the database itself. Both hide complexity well and both hide it from your version control unless you are deliberate about it.' },
    { id: 'db.nosql', name: 'Document & Key-Value Stores', icon: 'document-store', tier: 'advanced', requires: ['db.normal'], state: lock, percent: 0, xp: 2100,
      desc: 'Stores that drop the fixed schema in exchange for flexibility and easy horizontal growth. They do not remove the modeling work, they move it into your application, where nothing checks it for you.' },
    { id: 'db.backup', name: 'Backups & Recovery', icon: 'backup', tier: 'advanced', requires: ['db.migrate'], state: lock, percent: 0, xp: 2000,
      desc: 'Copies you could actually restore from, tested by restoring from them. An untested backup is a belief, and the moment you find out it was wrong is the worst possible one.' },
    { id: 'db.scale', name: 'Replication & Sharding', icon: 'shard', tier: 'expert', requires: ['db.isolation', 'db.backup'], state: lock, percent: 0, xp: 2600,
      desc: 'More machines: copies for reading, and splitting the data when one machine will not hold it. Both introduce the question of what a client sees when the copies briefly disagree.' },
    { id: 'db.warehouse', name: 'Analytical Stores', icon: 'warehouse', tier: 'expert', requires: ['db.views'], state: lock, percent: 0, xp: 2400,
      desc: 'Databases arranged by column instead of by row, because analysis reads three columns of everything rather than everything of three rows. The same SQL, an entirely different set of trade-offs underneath.' },
    { id: 'db.design', name: 'Schema Design', icon: 'schema', tier: 'mastery', core: true, requires: ['db.scale', 'db.warehouse'], state: lock, percent: 0, xp: 3000,
      desc: 'Choosing the shape of the data for the questions the system will actually be asked, years before most of them exist. This is the decision the rest of the application is built on top of and the hardest one to reverse.' },
  ],
};
