import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  type AiStatus,
  api,
  type ProjectDoc,
  type Project as ProjectT,
  type Role,
  type Stage,
} from '../api';
import { errMsg } from '../components/Dialog';
import DocCard from '../components/DocCard';
import GenerateDialog from '../components/GenerateDialog';
import IcfMatrix from '../components/IcfMatrix';
import {
  NewVersionDialog,
  UploadDocDialog,
} from '../components/ProjectDialogs';
import StageStepper from '../components/StageStepper';

const GROUPS: Role[] = ['sponsor', 'icf', 'other'];

export default function Project() {
  const { t } = useTranslation();
  const projectId = Number(useParams().id);
  const [project, setProject] = useState<ProjectT | null>(null);
  const [docs, setDocs] = useState<ProjectDoc[] | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'upload' | 'generate' | null>(null);
  const [versionFor, setVersionFor] = useState<ProjectDoc | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        api.getProject(projectId),
        api.listProjectDocs(projectId),
      ]);
      setProject(p);
      setDocs(d);
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

  async function setStage(stage: Stage) {
    try {
      setProject(await api.updateProject(projectId, { stage }));
    } catch (e) {
      setError(errMsg(e));
    }
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
  if (!project || !docs)
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
            onClick={() => setDialog('generate')}
          >
            {t('project.generate')}
          </button>
        </div>
      </div>

      <StageStepper stage={project.stage} onChange={setStage} />
      {error && <p className="error">{error}</p>}

      {docs.length === 0 && (
        <div className="empty">
          <h3>{t('project.emptyTitle')}</h3>
          <p>{t('project.emptyText')}</p>
        </div>
      )}
      <IcfMatrix docs={docs} />
      {GROUPS.map((g) => {
        const list = docs.filter((d) => d.role === g);
        if (list.length === 0) return null;
        return (
          <section key={g} className="group">
            <h2>{t(`project.groups.${g}`)}</h2>
            <div className="stack">
              {list.map((d) => (
                <DocCard
                  key={d.id}
                  doc={d}
                  onNewVersion={() => setVersionFor(d)}
                  onDelete={() => removeDoc(d)}
                />
              ))}
            </div>
          </section>
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
          onClose={() => setDialog(null)}
          onDone={load}
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
