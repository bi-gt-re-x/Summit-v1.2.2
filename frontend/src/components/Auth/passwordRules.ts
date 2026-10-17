/**
 * What a new password needs, from shared/rules.json `password`: the same
 * entries the server checks (`password_problem` in backend/tracking/auth.py),
 * so the list on the form can't promise something sign-up then refuses.
 */
import { RULES } from '@/utils/sharedRules';

export interface PasswordRule {
  key: string;
  label: string;
  met: boolean;
}

const COMPILED = RULES.password.rules.map((rule) => ({
  key: rule.key,
  label: rule.label,
  pattern: new RegExp(rule.pattern),
}));

/** Every rule, in order, with whether `password` meets it yet. */
export function passwordRules(password: string): PasswordRule[] {
  return COMPILED.map(({ key, label, pattern }) => ({ key, label, met: pattern.test(password) }));
}

/** Whether `password` meets every rule and isn't too long. */
export function passwordOk(password: string): boolean {
  return password.length <= RULES.password.max_length && passwordRules(password).every((rule) => rule.met);
}
