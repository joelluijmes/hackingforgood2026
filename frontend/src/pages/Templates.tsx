import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type Document } from '../api';
import { IcfOptions, LangOptions } from '../components/Options';
import UploadDialog from '../components/UploadDialog';
import { formatDate, formatSize } from '../format';

export default function Templates() {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [docs, setDocs] = useState<Document[] | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('');
  const [aud, setAud] = useState('');
  const [upload, setUpload] = useState(false);
  const [seeding, setSeeding] = useState(false);
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
    setDocs(null);
    load();
  }, [load]);

  const shown = (docs ?? []).filter(
    (d) => (!lang || d.language === lang) && (!aud || d.audience === aud),
  );

  async function seed() {
    setSeeding(true);
    try {
      const r = await api.seed();
      setToast(
        t('common.imported', { imported: r.imported, skipped: r.skipped }),
      );
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
    setSeeding(false);
  }

  async function remove(d: Document) {
    if (!window.confirm(t('templates.confirmDelete', { name: d.name }))) return;
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
          <h1>{t('templates.title')}</h1>
          <p className="muted">{t('templates.subtitle')}</p>
        </div>
        <div className="row">
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
            onClick={() => setUpload(true)}
          >
            {t('templates.upload')}
          </button>
        </div>
      </div>

      <div className="filters">
        <select
          aria-label={t('common.language')}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="">{t('templates.allLanguages')}</option>
          <LangOptions />
        </select>
        <select
          aria-label={t('templates.audience')}
          value={aud}
          onChange={(e) => setAud(e.target.value)}
        >
          <option value="">{t('templates.allAudiences')}</option>
          <IcfOptions />
        </select>
        <span className="muted">
          {t('templates.documents', { count: shown.length })}
        </span>
      </div>

      {error && (
        <p className="error">{t('templates.backendError', { error })}</p>
      )}
      {docs === null && <p className="muted">{t('common.loading')}</p>}
      {docs && shown.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ❡
          </div>
          <h3>{t('templates.emptyTitle')}</h3>
          <p>{t('templates.emptyText')}</p>
        </div>
      )}

      <div className="cards">
        {shown.map((d) => (
          <article key={d.id} className="card">
            <Link to={`/templates/${d.id}`} className="card-title">
              {d.name}
            </Link>
            <div className="card-file" title={d.filename}>
              {d.filename}
            </div>
            <div className="chips">
              {d.language && (
                <span className="chip lang">{d.language.toUpperCase()}</span>
              )}
              {d.audience && (
                <span className="chip">{t(`icfTypes.${d.audience}`)}</span>
              )}
              {d.version && <span className="chip">v {d.version}</span>}
            </div>
            <div className="card-foot">
              <span className="muted">
                {formatSize(d.size, L)} · {formatDate(d.uploaded_at, L)}
              </span>
              <span className="row">
                <a className="link" href={api.fileUrl(d.id)}>
                  {t('common.download')}
                </a>
                <button
                  type="button"
                  className="link danger"
                  onClick={() => remove(d)}
                >
                  {t('common.delete')}
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
