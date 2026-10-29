import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Document, formatSize, type Kind } from '../api';
import UploadDialog from '../components/UploadDialog';

const LANG: Record<string, string> = { en: 'EN', nl: 'NL', fr: 'FR' };

export default function Library() {
  const [kind, setKind] = useState<Kind>('sponsor');
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('');
  const [aud, setAud] = useState('');
  const [study, setStudy] = useState('');
  const [upload, setUpload] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setDocs(await api.listDocuments(kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDocs([]);
    }
  }, [kind]);

  useEffect(() => {
    setDocs(null);
    load();
  }, [load]);

  const studies = useMemo(
    () =>
      [
        ...new Set((docs ?? []).map((d) => d.study).filter(Boolean)),
      ] as string[],
    [docs],
  );

  const shown = (docs ?? []).filter(
    (d) =>
      (!lang || d.language === lang) &&
      (!aud || d.audience === aud) &&
      (!study || d.study === study),
  );

  async function seed() {
    setSeeding(true);
    try {
      const r = await api.seed();
      setToast(`Imported ${r.imported}, skipped ${r.skipped}.`);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
    setSeeding(false);
  }

  async function remove(d: Document) {
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    try {
      await api.deleteDocument(d.id);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p className="muted">
            Sponsor documents and the national ICF templates, in one place.
          </p>
        </div>
        <div className="row">
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
            onClick={() => setUpload(true)}
          >
            Upload
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(['sponsor', 'template'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? 'tab active' : 'tab'}
            onClick={() => setKind(k)}
          >
            {k === 'sponsor' ? 'Sponsor documents' : 'Templates'}
          </button>
        ))}
      </div>

      <div className="filters">
        <select
          aria-label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="nl">Nederlands</option>
          <option value="fr">Français</option>
        </select>
        <select
          aria-label="Audience"
          value={aud}
          onChange={(e) => setAud(e.target.value)}
        >
          <option value="">All audiences</option>
          <option value="adult">Adult</option>
          <option value="parent">Parent</option>
          <option value="adolescent">Adolescent</option>
          <option value="child">Child</option>
        </select>
        <select
          aria-label="Study"
          value={study}
          onChange={(e) => setStudy(e.target.value)}
        >
          <option value="">All studies</option>
          {studies.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="muted">
          {shown.length} document{shown.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <p className="error">
          Could not reach the backend: {error}. Is it running on port 8000?
        </p>
      )}
      {docs === null && <p className="muted">Loading…</p>}
      {docs && shown.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ❡
          </div>
          <h3>Nothing here yet</h3>
          <p>
            Upload a {kind === 'sponsor' ? 'sponsor document' : 'template'} or
            import the sample bucket to get started.
          </p>
        </div>
      )}

      <div className="cards">
        {shown.map((d) => (
          <article key={d.id} className="card">
            <Link to={`/documents/${d.id}`} className="card-title">
              {d.name}
            </Link>
            <div className="card-file" title={d.filename}>
              {d.filename}
            </div>
            <div className="chips">
              {d.language && (
                <span className="chip lang">{LANG[d.language]}</span>
              )}
              {d.audience && <span className="chip">{d.audience}</span>}
              {d.version && <span className="chip">v {d.version}</span>}
              {d.study && <span className="chip study">{d.study}</span>}
            </div>
            <div className="card-foot">
              <span className="muted">
                {formatSize(d.size)} ·{' '}
                {new Date(d.uploaded_at).toLocaleDateString()}
              </span>
              <span className="row">
                <a className="link" href={api.fileUrl(d.id)}>
                  Download
                </a>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => remove(d)}
                >
                  Delete
                </button>
              </span>
            </div>
          </article>
        ))}
      </div>

      {toast && (
        <button type="button" className="toast" onClick={() => setToast('')}>
          {toast}
        </button>
      )}
      {upload && (
        <UploadDialog
          kind={kind}
          onClose={() => setUpload(false)}
          onDone={() => {
            setUpload(false);
            load();
          }}
        />
      )}
    </div>
  );
}
