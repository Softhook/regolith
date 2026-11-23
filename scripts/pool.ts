/**
 * Plays a self-play script's tasks in parallel: `jobs` worker processes (the script run again, with
 * POOL_WORKER set) each take the next task as they free up, so fast and slow cores both stay busy
 * to the end. Tasks and results travel as JSON, so they must be plain data.
 *
 * `done` gets the results in task order, whichever worker finishes first, and `skip` (checked
 * before each task is handed out, and again before its result is passed on) leaves out tasks no
 * longer needed: a match stopped early. A worker still playing such a task is stopped, and another
 * started if there is other work (one starts in a fraction of a second, less than a game takes).
 * With tasks that carry their own seeds, the results, and where a match stops, are then the same
 * with any number of jobs. `progress` hears of each task finished, in any order, for a progress line.
 *
 * Call `pool` once, after the script's setup and before its report. In a worker it serves tasks and
 * never returns (the worker exits when the main process is done with it). With jobs <= 1 the tasks
 * are played in this process, in order.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';

/** Set for a worker process. */
export const isWorker = !!process.env.POOL_WORKER;

/**
 * The default number of jobs: the fast cores where the machine says (Apple silicon's performance
 * cores), otherwise all of them. On an M4 (4 fast, 6 slow cores) 10 jobs were no faster than 4:
 * a slow core plays a game about 3 times slower, and the last games wait on it.
 */
export const defaultJobs = String(fastCores() ?? availableParallelism());

function fastCores(): number | undefined {
  if (process.platform !== 'darwin') return undefined;
  try {
    return Number(execFileSync('sysctl', ['-n', 'hw.perflevel0.physicalcpu'], { encoding: 'utf8' })) || undefined;
  } catch {
    return undefined;
  }
}

const workers = new Set<ChildProcess>();
// Ctrl-C reaches the workers too, but not every way of stopping does.
process.on('exit', () => {
  for (const w of workers) w.kill('SIGKILL');
});

let waiting: (() => void) | undefined;

/**
 * Passes on the results still waiting for an earlier one, out of order: for a report of a run
 * stopped part way (Ctrl-C), which should count every game finished.
 */
export function deliverWaiting() {
  waiting?.();
}

export interface PoolOptions<T> {
  skip?: (task: T) => boolean;
  progress?: (task: T) => void;
}

export async function pool<T, R>(
  script: string,
  tasks: T[],
  jobs: number,
  play: (task: T) => R,
  done: (result: R, task: T) => void,
  { skip = () => false, progress }: PoolOptions<T> = {},
): Promise<void> {
  if (isWorker) {
    // A main process gone meanwhile (stopped, or another task failed) is no error here: the worker just ends.
    process.on('message', ([i, task]: [number, T]) => {
      const r = play(task);
      if (process.connected) process.send!([i, r], (e: Error | null) => e && process.exit(0));
    });
    process.on('disconnect', () => process.exit(0));
    return new Promise(() => {});
  }
  if (jobs <= 1) {
    for (const t of tasks)
      if (!skip(t)) {
        const r = play(t);
        progress?.(t);
        done(r, t);
      }
    return;
  }
  let sent = 0;
  /** Results waiting for the ones before them, by task index; null for a task left out. */
  const results = new Map<number, R | null>();
  let delivered = 0;
  const deliver = () => {
    for (; results.has(delivered); delivered++) {
      const r = results.get(delivered)!;
      results.delete(delivered);
      if (r !== null && !skip(tasks[delivered])) done(r, tasks[delivered]);
    }
  };
  waiting = () => {
    for (const i of [...results.keys()].sort((x, y) => x - y)) {
      const r = results.get(i)!;
      results.delete(i);
      if (r !== null && !skip(tasks[i])) done(r, tasks[i]);
    }
  };
  /** The index of the next task to hand out, leaving out those skipped; undefined when none is left. */
  const take = (): number | undefined => {
    for (; sent < tasks.length; sent++) {
      if (!skip(tasks[sent])) return sent++;
      results.set(sent, null);
    }
    return undefined;
  };
  const more = () => tasks.slice(sent).some((t) => !skip(t));
  /** Each worker's task, while it plays one. */
  const busy = new Map<ChildProcess, number>();
  /** Workers stopped because their task was no longer needed. */
  const dropped = new Set<ChildProcess>();

  return new Promise<void>((resolve, reject) => {
    let live = 0;
    /** Stops workers whose task is no longer needed. */
    const drop = () => {
      for (const [child, i] of busy)
        if (skip(tasks[i])) {
          busy.delete(child);
          results.set(i, null);
          dropped.add(child);
          // SIGKILL: vite-node handles SIGTERM, which then waits for the game in progress to end.
          child.kill('SIGKILL');
        }
      deliver();
    };
    const start = () => {
      // Under vite-node, argv[1] is vite-node itself and the script's path is left out.
      const child = spawn(process.execPath, [process.argv[1], script, ...process.argv.slice(2)], {
        env: { ...process.env, POOL_WORKER: '1' },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      live++;
      workers.add(child);
      const next = () => {
        const i = take();
        if (i === undefined) return child.disconnect();
        busy.set(child, i);
        child.send([i, tasks[i]]);
      };
      child.on('message', ([i, r]: [number, R]) => {
        // Sent before it was stopped: the task is no longer needed.
        if (dropped.has(child)) return;
        busy.delete(child);
        results.set(i, r);
        progress?.(tasks[i]);
        deliver();
        drop();
        next();
      });
      child.on('error', reject);
      child.on('exit', (code, signal) => {
        workers.delete(child);
        live--;
        const i = busy.get(child);
        if (i !== undefined) return reject(new Error(`task ${JSON.stringify(tasks[i])} failed (${signal ?? `exit ${code}`})`));
        if (dropped.delete(child) && more()) start();
        if (live === 0) {
          deliver();
          waiting = undefined;
          resolve();
        }
      });
      next();
    };
    for (let k = 0; k < Math.min(jobs, tasks.length); k++) start();
  });
}
