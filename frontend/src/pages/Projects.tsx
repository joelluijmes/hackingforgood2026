import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type Project } from '../api';
import Dialog, { errMsg } from '../components/Dialog';
import { formatDate } from '../format';

function NewProjectDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [study, setStudy] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createProject({ name, study, description });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={t('projects.new')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('common.create')}
      disabled={!name.trim()}
      busy={busy}
      error={error}
    >
      <div className="stack">
        <label>
          {t('projects.name')}
          <input
            required
            value={name}
            placeholder={t('projects.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t('projects.study')}
          <input value={study} onChange={(e) => setStudy(e.target.value)} />
        </label>
        <label>
          {t('projects.description')}
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

export default function Projects() {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      setError(errMsg(e));
      setProjects([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function seed() {
    setSeeding(true);
    try {
      const r = await api.seed();
      setToast(
        t('common.imported', { imported: r.imported, skipped: r.skipped }),
      );
      await load();
    } catch (e) {
      setToast(errMsg(e));
    }
    setSeeding(false);
  }

  async function remove(p: Project) {
    if (!window.confirm(t('projects.confirmDelete', { name: p.name }))) return;
    try {
      await api.deleteProject(p.id);
      await load();
    } catch (e) {
      setToast(errMsg(e));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('projects.title')}</h1>
          <p className="muted">{t('projects.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setCreating(true)}
        >
          {t('projects.new')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {projects === null && <p className="muted">{t('common.loading')}</p>}
      {projects && projects.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ❡
          </div>
          <h3>{t('projects.emptyTitle')}</h3>
          <p>{t('projects.emptyText')}</p>
          <div className="row center">
            <button
              type="button"
              className="btn"
              onClick={seed}
              disabled={seeding}
            >
              {seeding ? t('common.importing') : t('common.importSample')}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setCreating(true)}
            >
              {t('projects.create')}
            </button>
          </div>
        </div>
      )}

      <div className="cards">
        {projects?.map((p) => (
          <article key={p.id} className="card">
            <Link to={`/projects/${p.id}`} className="card-title">
              {p.name}
            </Link>
            {p.study && <div className="card-file">{p.study}</div>}
            <div className="chips">
              <span className="chip lang">{t(`stages.${p.stage}.label`)}</span>
              <span className="chip">
                {t('projects.documents', { count: p.doc_count })}
              </span>
              {p.open_comments > 0 && (
                <span className="chip warn">
                  {t('projects.openComments', { count: p.open_comments })}
                </span>
              )}
            </div>
            <div className="card-foot">
              <span className="muted">
                {p.created_by_name} · {formatDate(p.created_at, i18n.language)}
              </span>
              <button
                type="button"
                className="link danger"
                onClick={() => remove(p)}
              >
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
      </div>

      {toast && (
        <button type="button" className="toast" onClick={() => setToast('')}>
          {toast}
        </button>
      )}
      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
