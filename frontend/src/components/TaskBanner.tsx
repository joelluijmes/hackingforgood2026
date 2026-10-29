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

function TaskCard({
  meta,
  onFinished,
  onDismiss,
}: {
  meta: TaskMeta;
  onFinished: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [task, setTask] = useState<Task | null>(null);
  const [lost, setLost] = useState(false);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api.task(meta.id);
        if (stop) return;
        setTask(r);
        if (r.status === 'running') {
          timer = setTimeout(tick, 1500);
        } else {
          finished.current();
        }
      } catch {
        if (stop) return;
        setLost(true);
      }
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [meta.id]);

  const icf = meta.icfType ? t(`icfTypes.${meta.icfType}`) : '';
  const title =
    meta.kind === 'generate'
      ? t('task.titleGenerate', { lang: t(`languages.${meta.langs}`), icf })
      : t('task.titleTranslate', { langs: meta.langs.toUpperCase() });

  if (lost)
    return (
      <div className="task-card failed">
        <b>{title}</b>
        <p className="error">{t('task.lost')}</p>
        <button type="button" className="link" onClick={onDismiss}>
          {t('task.dismiss')}
        </button>
      </div>
    );

  const running = !task || task.status === 'running';
  const pct = Math.round((task?.progress ?? 0) * 100);
  const secs = Math.floor(task?.elapsed_s ?? 0);
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  if (task?.status === 'failed')
    return (
      <div className="task-card failed" role="alert">
        <b>{title}</b>
        <p className="error">{task.error ?? t('task.failed')}</p>
        <button type="button" className="link" onClick={onDismiss}>
          {t('task.dismiss')}
        </button>
      </div>
    );

  if (task?.status === 'done') {
    const reports = task.result?.reports ?? [];
    const filled = reports.reduce((a, r) => a + r.filled, 0);
    const flagged = reports.reduce((a, r) => a + r.flagged, 0);
    const docs = task.result?.docs ?? [];
    return (
      <div className="task-card done">
        <b>{title}</b>
        <p>{t('task.ready', { filled, flagged })}</p>
        <div className="row">
          {docs.map((d) => {
            const v = d.versions[0];
            return v ? (
              <Link key={d.id} className="btn" to={`/versions/${v.id}`}>
                {t('task.open')}
                {docs.length > 1 && d.language
                  ? ` ${d.language.toUpperCase()}`
                  : ''}
              </Link>
            ) : null;
          })}
          <button type="button" className="link" onClick={onDismiss}>
            {t('task.dismiss')}
          </button>
        </div>
      </div>
    );
  }

  const step = task?.step ?? 'queued';
  return (
    <div className="task-card" aria-live="polite">
      <div className="task-head">
        <b>{title}</b>
        <span className="muted">{elapsed}</span>
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
      <div className="task-step">
        <span>
          {t(`task.step.${step}`, {
            done: task?.done ?? 0,
            total: task?.total ?? 0,
          })}
          {meta.kind === 'translate' && task?.language && running
            ? ` · ${t('task.producing', { lang: task.language.toUpperCase() })}`
            : ''}
        </span>
        <b>{pct}%</b>
      </div>
      <p className="muted small">{t('task.hint')}</p>
    </div>
  );
}

export default function TaskBanner({
  tasks,
  onFinished,
  onDismiss,
}: {
  tasks: TaskMeta[];
  onFinished: () => void;
  onDismiss: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="tasks">
      {tasks.map((m) => (
        <TaskCard
          key={m.id}
          meta={m}
          onFinished={onFinished}
          onDismiss={() => onDismiss(m.id)}
        />
      ))}
    </div>
  );
}
