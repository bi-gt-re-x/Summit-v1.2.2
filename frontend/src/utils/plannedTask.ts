/**
 * A session booked by "Plan my next session", put on the task list on screen.
 *
 * The Tasks page and the calendar share one task list, read once a session
 * (context/UserDataProvider), so a session booked from a subject page, the
 * dashboard or the Recommendations tab has to be written onto it — otherwise
 * neither shows the session until the page is reloaded. This is the update to
 * hand that list's `mutate`; it adds the task once, whoever asks twice.
 */
import type { PlannedSession } from '@/services/analytics';
import type { UserData } from '@/services/tasks';
import { xpToPriority } from '@/utils/priority';

export function withPlannedTask(
  current: UserData,
  booked: PlannedSession,
  title: string,
  subjectId = '',
): UserData {
  if (current.tasks.some((task) => String(task.id) === String(booked.id))) return current;
  const subject = booked.subject || subjectId;
  return {
    ...current,
    tasks: [
      ...current.tasks,
      {
        id: String(booked.id),
        title,
        description: '',
        priority: xpToPriority(booked.xp),
        status: 'todo',
        xp_value: booked.xp,
        created_at: booked.start,
        due_date: booked.end,
        show_on_calendar: true,
        ...(subject ? { subject } : {}),
      },
    ],
  };
}
