/**
 * "What your work says so far": the first reads, as an Overview panel.
 *
 * The arithmetic and the rules it keeps are in ./reads. This draws up to
 * four of them, each with the sample it came from, and before there are any
 * it says exactly how many more activities it needs, so a new account has a
 * reason to come back after its third task or sitting.
 *
 * The sittings are read here rather than passed down: they live on their own
 * endpoint (`/api/focus/sittings`), nothing else on this page uses them, and a
 * failed read just leaves the sitting-based reads out.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from './charts';
import { firstReads, readsToGo } from './reads';
import { focus as focusService } from '@/services';
import type { Interval } from '@/components/Timer/intervals';
import type { Goal, Task } from '@/types';

export function FirstReads({ tasks, goals }: { tasks: Task[]; goals: Goal[] }) {
  const [sittings, setSittings] = useState<Interval[]>([]);

  useEffect(() => {
    let live = true;
    focusService.sittings()
      .then((result) => {
        if (live && result.success) setSittings(result.sittings ?? []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const reads = useMemo(() => firstReads({ tasks, sittings, goals }), [tasks, sittings, goals]);
  const toGo = readsToGo(tasks, sittings);

  return (
    <Panel
      title="What we see so far"
      note="Based on what you've done. Each one shows where it comes from."
      className="ax-reads-panel"
    >
      {reads.length ? (
        <ul className="ax-reads">
          {reads.map((read) => (
            <li key={read.id}>
              <span className="ax-reads-label">{read.label}</span>
              <p>{read.text}</p>
              <span className="ax-reads-basis">{read.basis}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ax-reads-empty">
          {toGo > 0
            ? `Finish ${toGo} more ${toGo === 1 ? 'task or focus session' : 'tasks or focus sessions'} and your first results show up here.`
            : "Keep going. Results show up once there's enough of one kind of work."}{' '}
          <Link className="ax-link" to="/timer">Start a session</Link>
        </p>
      )}
    </Panel>
  );
}
