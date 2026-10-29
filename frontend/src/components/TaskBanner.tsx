import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type Task } from '../api';

export interface TaskMeta {
  id: string;
  kind: 'generate' | 'translate';
  /** Language label for the title (generate: language; translate: targets). */
  langs: string;
  icfType?: string;
  /** translate: source doc id and target languages (to disable matrix buttons) */
  docId?: number;
  targets?: string[];
}

type Entry = Task | 'lost';

const fmtElapsed = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

export default function TaskBanner({
  tasks,
  onFinished,
  onDismiss,
}: {
  tasks: TaskMeta[];
  onFinished: () => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const finishedIds = useRef(new Set<string>());
  const dismissTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const cb = useRef({ onFinished, onDismiss });
  cb.current = { onFinished, onDismiss };
  const idKey = tasks.map((m) => m.id).join(',');

  // Poll every task that is not finished yet, from one loop.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const pending = idKey
        .split(',')
        .filter((id) => id && !finishedIds.current.has(id));
      await Promise.all(
        pending.map(async (id) => {
          let entry: Entry;
          try {
            entry = await api.task(id);
          } catch {
            entry = 'lost';
          }
          if (stop) return;
          setEntries((cur) => ({ ...cur, [id]: entry }));
          if (entry === 'lost' || entry.status !== 'running') {
            finishedIds.current.add(id);
            cb.current.onFinished();
            if (entry !== 'lost' && entry.status === 'done') {
              dismissTimers.current.set(
                id,
                setTimeout(() => cb.current.onDismiss(id), 4000),
              );
            }
          }
        }),
      );
      const stillRunning = idKey
        .split(',')
        .some((id) => id && !finishedIds.current.has(id));
      if (!stop && stillRunning) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [idKey]);

  useEffect(
    () => () => {
      for (const h of dismissTimers.current.values()) clearTimeout(h);
    },
    [],
  );

  if (tasks.length === 0) return null;

  const titleOf = (m: TaskMeta) =>
    m.kind === 'generate'
      ? t('task.titleGenerate', {
          lang: t(`languages.${m.langs}`),
          icf: m.icfType ? t(`icfTypes.${m.icfType}`) : '',
        })
      : t('task.titleTranslate', { langs: m.langs.toUpperCase() });

  const failed: { m: TaskMeta; msg: string }[] = [];
  const done: { m: TaskMeta; task: Task }[] = [];
  const active: { m: TaskMeta; task: Task | null }[] = [];
  for (const m of tasks) {
    const e = entries[m.id];
    if (e === 'lost') failed.push({ m, msg: t('task.lost') });
    else if (e?.status === 'failed')
      failed.push({ m, msg: e.error ?? t('task.failed') });
    else if (e?.status === 'done') done.push({ m, task: e });
    else active.push({ m, task: e ?? null });
  }

  const total = active.length + done.length;
  const pct = Math.round(
    ((done.length + active.reduce((a, x) => a + (x.task?.progress ?? 0), 0)) /
      Math.max(total, 1)) *
      100,
  );
  const elapsed = Math.max(0, ...active.map((x) => x.task?.elapsed_s ?? 0));
  const summary =
    active.length === 1 && done.length === 0
      ? titleOf(active[0].m)
      : t('task.runningMany', { total, done: done.length });

  return (
    <div className="tasks">
      {active.length > 0 && (
        <div className="task-card compact" aria-live="polite">
          <div className="task-head">
            <b>{summary}</b>
            <span className="muted">
              {pct}% · {fmtElapsed(elapsed)}
            </span>
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
          <details className="task-details">
            <summary>{t('task.details')}</summary>
            <ul>
              {tasks.map((m) => {
                const e = entries[m.id];
                const task = e && e !== 'lost' ? e : null;
                const isDone = task?.status === 'done';
                return (
                  <li key={m.id}>
                    <span>{titleOf(m)}</span>
                    <span className="muted small">
                      {isDone
                        ? t('task.step.done')
                        : t(`task.step.${task?.step ?? 'queued'}`, {
                            done: task?.done ?? 0,
                            total: task?.total ?? 0,
                          })}
                      {m.kind === 'translate' && task?.language && !isDone
                        ? ` · ${t('task.producing', { lang: task.language.toUpperCase() })}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      )}
      {done.map(({ m, task }) => {
        const reports = task.result?.reports ?? [];
        const filled = reports.reduce((a, r) => a + r.filled, 0);
        const flagged = reports.reduce((a, r) => a + r.flagged, 0);
        const docs = task.result?.docs ?? [];
        return (
          <div key={m.id} className="task-toast" role="status">
            <span>
              <b>{titleOf(m)}</b> · {t('task.ready', { filled, flagged })}
            </span>
            {docs.map((d) => {
              const v = d.versions[0];
              return v ? (
                <Link key={d.id} className="link" to={`/versions/${v.id}`}>
                  {t('task.open')}
                  {docs.length > 1 && d.language
                    ? ` ${d.language.toUpperCase()}`
                    : ''}
                </Link>
              ) : null;
            })}
          </div>
        );
      })}
      {failed.map(({ m, msg }) => (
        <div key={m.id} className="task-card failed" role="alert">
          <b>{titleOf(m)}</b>
          <p className="error">{msg}</p>
          <button
            type="button"
            className="link"
            onClick={() => onDismiss(m.id)}
          >
            {t('task.dismiss')}
          </button>
        </div>
      ))}
    </div>
  );
}
