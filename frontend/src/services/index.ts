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
export * as api from './api';
export * as auth from './auth';
export * as notifications from './notifications';
export * as settings from './settings';
export * as tasks from './tasks';
export * from './constants';
