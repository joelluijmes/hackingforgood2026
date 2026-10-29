import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  type AiStatus,
  api,
  type IcfType,
  type Language,
  type MatrixCell,
  type ProjectDoc,
  type ProjectProgress,
  type Project as ProjectT,
  type Role,
} from '../api';
import { errMsg } from '../components/Dialog';
import DocCard from '../components/DocCard';
import GenerateDialog from '../components/GenerateDialog';
import IcfMatrix from '../components/IcfMatrix';
import {
  NewVersionDialog,
  UploadDocDialog,
} from '../components/ProjectDialogs';
import StageTracker from '../components/StageStepper';
import TaskBanner, { type TaskMeta } from '../components/TaskBanner';
import ParticipantAdminPanel from '../components/ParticipantAdminPanel';

const GROUPS: Role[] = ['sponsor', 'icf', 'other'];

function loadTasks(projectId: number): TaskMeta[] {
  try {
    return JSON.parse(sessionStorage.getItem(`icf-tasks-${projectId}`) ?? '[]');
  } catch {
    return [];
  }
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: (o: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="group section"
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary>
        <span className="chev" aria-hidden="true" />
        <h2>{title}</h2>
        <span className="chip">{count}</span>
      </summary>
      <div className="stack">{children}</div>
    </details>
  );
}

export default function Project() {
  const { t } = useTranslation();
  const projectId = Number(useParams().id);
  const [project, setProject] = useState<ProjectT | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[] | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [tasks, setTasks] = useState<TaskMeta[]>(() => loadTasks(projectId));
  const [preset, setPreset] = useState<
    { icf: IcfType; language: Language } | undefined
  >();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const opened = useRef(false);
  const [dialog, setDialog] = useState<'upload' | 'generate' | null>(null);
  const [versionFor, setVersionFor] = useState<ProjectDoc | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, d, pr] = await Promise.all([
        api.getProject(projectId),
        api.listProjectDocs(projectId),
        api.progress(projectId),
      ]);
      setProject(p);
      setDocs(d);
      setProgress(pr);
      if (!opened.current) {
        opened.current = true;
        // sponsor docs collapsed once an ICF draft exists
        setOpen({
          sponsor: !d.some((x) => x.role === 'icf'),
          icf: true,
          other: true,
        });
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, [projectId]);

  useEffect(() => {
    load();
    api
      .aiStatus()
      .then(setAi)
      .catch(() => setAi(null));
  }, [load]);

  function saveTasks(list: TaskMeta[]) {
    setTasks(list);
    try {
      sessionStorage.setItem(`icf-tasks-${projectId}`, JSON.stringify(list));
    } catch {
      // storage unavailable: tasks just won't survive a reload
    }
  }
  const addTask = (m: TaskMeta) => saveTasks([...tasks, m]);

  async function translate(
    en: MatrixCell,
    icf: IcfType,
    langs: ('nl' | 'fr')[],
  ) {
    setError('');
    try {
      const r = await api.translate(en.doc_id, {
        target_languages: langs,
        version_id: en.version_id,
      });
      addTask({
        id: r.task_id,
        kind: 'translate',
        langs: langs.join(' + '),
        icfType: icf,
        docId: en.doc_id,
        targets: langs,
      });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function openGenerate(p?: { icf: IcfType; language: Language }) {
    setPreset(p);
    setDialog('generate');
  }

  const busy = new Set<string>();
  for (const m of tasks)
    for (const l of m.targets ?? []) {
      busy.add(`${m.docId}:${l}`);
      busy.add(`${m.docId}`);
    }

  async function removeDoc(d: ProjectDoc) {
    if (!window.confirm(t('project.confirmDeleteDoc', { title: d.title })))
      return;
    try {
      await api.deleteProjectDoc(d.id);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const done = () => {
    setDialog(null);
    setVersionFor(null);
    load();
  };

  if (error && !project) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/">{t('common.backToProjects')}</Link>
      </div>
    );
  }
  if (!project || !docs || !progress)
    return <div className="page muted">{t('common.loading')}</div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/" className="muted">
            {t('project.backToProjects')}
          </Link>
          <h1>{project.name}</h1>
          <div className="chips">
            {project.study && (
              <span className="chip study">{project.study}</span>
            )}
            <span className={`chip ${ai?.enabled ? 'ok' : ''}`}>
              {ai?.enabled
                ? t('project.aiOn', { model: ai.model })
                : t('project.aiOff')}
            </span>
          </div>
          {project.description && (
            <p className="muted desc">{project.description}</p>
          )}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => setDialog('upload')}
          >
            {t('project.uploadDocument')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => openGenerate()}
          >
            {t('project.generate')}
          </button>
        </div>
      </div>

      <StageTracker
        projectId={projectId}
        progress={progress}
        onChanged={load}
      />
      {error && <p className="error">{error}</p>}

      <TaskBanner
        tasks={tasks}
        onFinished={load}
        onDismiss={(id) => saveTasks(tasks.filter((x) => x.id !== id))}
      />

      <ParticipantAdminPanel projectId={projectId} docs={docs} approved={project.stage === 'approved'} />

      <section className="group">
        <h2>{t('matrix.title')}</h2>
        <IcfMatrix
          matrix={progress.matrix}
          busyLangs={busy}
          onGenerate={(icf) => openGenerate({ icf, language: 'en' })}
          onTranslate={translate}
        />
      </section>

      {docs.length === 0 && (
        <div className="empty">
          <h3>{t('project.emptyTitle')}</h3>
          <p>{t('project.emptyText')}</p>
        </div>
      )}
      {GROUPS.map((g) => {
        const list = docs.filter((d) => d.role === g);
        if (list.length === 0) return null;
        return (
          <Section
            key={g}
            title={t(`project.groups.${g}`)}
            count={list.length}
            open={open[g] ?? true}
            onToggle={(o) => setOpen((x) => ({ ...x, [g]: o }))}
          >
            {list.map((d) => (
              <DocCard
                key={d.id}
                doc={d}
                sourceTitle={docs.find((x) => x.id === d.source_doc_id)?.title}
                onNewVersion={() => setVersionFor(d)}
                onDelete={() => removeDoc(d)}
              />
            ))}
          </Section>
        );
      })}

      {dialog === 'upload' && (
        <UploadDocDialog
          projectId={projectId}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog === 'generate' && (
        <GenerateDialog
          projectId={projectId}
          docs={docs}
          preset={preset}
          onClose={() => setDialog(null)}
          onStarted={addTask}
        />
      )}
      {versionFor && (
        <NewVersionDialog
          doc={versionFor}
          onClose={() => setVersionFor(null)}
          onDone={done}
        />
      )}
    </div>
  );
}
