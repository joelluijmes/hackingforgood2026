import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Project } from '../api';
import Dialog, { errMsg } from '../components/Dialog';
import { STAGES } from '../components/StageStepper';

function NewProjectDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
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
      title="New project"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Create"
      disabled={!name.trim()}
      busy={busy}
      error={error}
    >
      <div className="stack">
        <label>
          Name
          <input
            required
            value={name}
            placeholder="e.g. Forum study"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Study
          <input value={study} onChange={(e) => setStudy(e.target.value)} />
        </label>
        <label>
          Description
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
      setToast(`Imported ${r.imported}, skipped ${r.skipped}.`);
      await load();
    } catch (e) {
      setToast(errMsg(e));
    }
    setSeeding(false);
  }

  async function remove(p: Project) {
    if (!window.confirm(`Delete project "${p.name}" and all its documents?`))
      return;
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
          <h1>Projects</h1>
          <p className="muted">
            One project per study: sponsor documents, ICF drafts and every
            reviewed version.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setCreating(true)}
        >
          New project
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {projects === null && <p className="muted">Loading…</p>}
      {projects && projects.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ❡
          </div>
          <h3>No projects yet</h3>
          <p>Start from the sample bucket or create your own project.</p>
          <div className="row center">
            <button
              type="button"
              className="btn"
              onClick={seed}
              disabled={seeding}
            >
              {seeding ? 'Importing…' : 'Import sample bucket'}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setCreating(true)}
            >
              Create project
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
              <span className="chip lang">
                {STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}
              </span>
              <span className="chip">
                {p.doc_count} document{p.doc_count === 1 ? '' : 's'}
              </span>
              {p.open_comments > 0 && (
                <span className="chip warn">
                  {p.open_comments} open comments
                </span>
              )}
            </div>
            <div className="card-foot">
              <span className="muted">
                {p.created_by_name} ·{' '}
                {new Date(p.created_at).toLocaleDateString()}
              </span>
              <button
                type="button"
                className="link danger"
                onClick={() => remove(p)}
              >
                Delete
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
