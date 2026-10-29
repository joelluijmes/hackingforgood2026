import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type Document } from '../api';
import UploadDialog from '../components/UploadDialog';
import { formatDate, formatSize } from '../format';

interface Family {
  key: string;
  name: string;
  language: Document['language'];
  audience: Document['audience'];
  versions: Document[]; // newest first
}

const LANG_ORDER = ['en', 'nl', 'fr'];

function vnum(v: string | null): number[] {
  return (v ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
}

function newer(a: Document, b: Document): number {
  const ra = a.released ?? '';
  const rb = b.released ?? '';
  if (ra !== rb) return rb.localeCompare(ra);
  const va = vnum(a.version);
  const vb = vnum(b.version);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? 0) - (va[i] ?? 0);
    if (d) return d;
  }
  return b.uploaded_at.localeCompare(a.uploaded_at);
}

function group(docs: Document[]): Family[] {
  const map = new Map<string, Family>();
  for (const d of docs) {
    const key = `${d.language ?? ''}|${d.audience ?? ''}|${d.name}`;
    let f = map.get(key);
    if (!f) {
      f = {
        key,
        name: d.name,
        language: d.language,
        audience: d.audience,
        versions: [],
      };
      map.set(key, f);
    }
    f.versions.push(d);
  }
  const rank = (l: string | null) => {
    const i = LANG_ORDER.indexOf(l ?? '');
    return i < 0 ? LANG_ORDER.length : i;
  };
  const out = [...map.values()];
  for (const f of out) f.versions.sort(newer);
  out.sort(
    (a, b) =>
      rank(a.language) - rank(b.language) || a.name.localeCompare(b.name),
  );
  return out;
}

export default function Templates() {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<{ family?: Family } | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setDocs(await api.listDocuments('template'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(d: Document) {
    if (
      !window.confirm(
        t('templates.confirmDelete', {
          name: `${d.name} v${d.version ?? '?'}`,
        }),
      )
    )
      return;
    try {
      await api.deleteDocument(d.id);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  const families = group(docs ?? []);

  function title(f: Family) {
    const lang = f.language ? t(`languagesNative.${f.language}`) : '';
    return lang ? `${f.name} (${lang})` : f.name;
  }

  function meta(d: Document) {
    return [
      d.released ? formatDate(d.released, L) : null,
      formatSize(d.size, L),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function actions(d: Document, deletable: boolean) {
    return (
      <span className="row">
        <Link className="btn" to={`/templates/${d.id}`}>
          {t('common.open')}
        </Link>
        <a className="link" href={api.fileUrl(d.id)}>
          {t('common.download')}
        </a>
        {deletable && (
          <button
            type="button"
            className="link danger"
            onClick={() => remove(d)}
          >
            {t('common.delete')}
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('templates.title')}</h1>
          <p className="muted">{t('templates.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setUpload({})}
        >
          {t('templates.upload')}
        </button>
      </div>

      {error && (
        <p className="error">{t('templates.backendError', { error })}</p>
      )}
      {docs === null && <p className="muted">{t('common.loading')}</p>}
      {docs && families.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ❡
          </div>
          <h3>{t('templates.emptyTitle')}</h3>
          <p>{t('templates.emptyText')}</p>
          <Link className="btn" to="/admin">
            {t('projects.sampleData')}
          </Link>
        </div>
      )}

      {families.map((f) => {
        const [latest, ...older] = f.versions;
        return (
          <article key={f.key} className="card family">
            <div className="family-head">
              <div>
                <h3>{title(f)}</h3>
                <div className="chips">
                  {f.language && (
                    <span className="chip lang">
                      {f.language.toUpperCase()}
                    </span>
                  )}
                  {f.audience && (
                    <span className="chip">{t(`icfTypes.${f.audience}`)}</span>
                  )}
                  <span className="chip ok">
                    v{latest.version ?? '?'} · {t('templates.latest')}
                  </span>
                </div>
                <div className="muted" title={latest.filename}>
                  {meta(latest)}
                </div>
                <div className="card-file" title={latest.filename}>
                  {latest.filename}
                </div>
              </div>
              <div className="row">
                {actions(latest, false)}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setUpload({ family: f })}
                >
                  {t('templates.uploadVersion')}
                </button>
              </div>
            </div>
            {older.length > 0 && (
              <details className="versions">
                <summary>
                  {t('templates.olderVersions', { count: older.length })}
                </summary>
                {older.map((d) => (
                  <div key={d.id} className="vrow">
                    <span title={d.filename}>
                      <strong>v{d.version ?? '?'}</strong>{' '}
                      <span className="muted">{meta(d)}</span>
                      <div className="card-file">{d.filename}</div>
                    </span>
                    {actions(d, true)}
                  </div>
                ))}
              </details>
            )}
          </article>
        );
      })}

      {toast && (
        <button type="button" className="toast" onClick={() => setToast('')}>
          {toast}
        </button>
      )}
      {upload && (
        <UploadDialog
          family={upload.family}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            load();
          }}
        />
      )}
    </div>
  );
}
