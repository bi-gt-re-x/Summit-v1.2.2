/**
 * The API, by area.
 *
 * Namespaced rather than flattened, because several areas have a `create` or a
 * `history` and `tasks.create(...)` reads better than `createTask(...)` beside
 * `createEntry(...)`:
 *
 *   import { tasks, goals } from '@/services';
 *   const result = await tasks.getUserData(username);
 */
export * as achievements from './achievements';
export * as analytics from './analytics';
export * as api from './api';
export * as auth from './auth';
export * as avatars from './avatars';
export * as events from './events';
export * as focus from './focus';
export * as goals from './goals';
export * as growth from './growth';
export * as next from './next';
export * as notes from './notes';
export * as notifications from './notifications';
export * as quote from './quote';
export * as records from './records';
export * as settings from './settings';
export * as skillAttempts from './skillAttempts';
export * as skillSteps from './skillSteps';
export * as subjects from './subjects';
export * as tasks from './tasks';
export * from './constants';
