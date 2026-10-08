/**
 * The rules the browser and the server both apply — shared/rules.json.
 *
 * Imported here once and re-exported with types, so a module reads
 * `RULES.task_xp.min` rather than a number typed beside a comment saying it
 * mirrors the server's. The server reads the same file
 * (backend/config/shared.py). shared/README.md says more.
 */
import rules from '@shared/rules.json';

export const RULES = rules;
