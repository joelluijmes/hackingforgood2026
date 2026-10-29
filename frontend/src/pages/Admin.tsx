import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AdminStatus, api, type SeedResult } from '../api';
import { errMsg } from '../components/Dialog';

export default function Admin() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [seedError, setSeedError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await api.adminStatus());
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function seed() {
    setSeeding(true);
    setSeedError('');
    try {
      setResult(await api.seed());
      await load();
    } catch (e) {
      setSeedError(errMsg(e));
    }
    setSeeding(false);
  }

  async function reset(withSamples: boolean, generatedOnly = false) {
    const local = status?.storage.backend === 'local';
    const msg = generatedOnly
      ? t('admin.clearConfirm')
      : t('admin.resetConfirm', {
          local: local ? t('admin.resetLocal') : '',
          samples: withSamples ? t('admin.resetSamplesNote') : '',
        });
    if (!window.confirm(msg)) return;
    setResetting(true);
    setResetError('');
    try {
      const r = await api.adminReset(withSamples, generatedOnly);
      setResult(r.seed);
      await load();
    } catch (e) {
      setResetError(errMsg(e));
    }
    setResetting(false);
  }

  const yn = (b: boolean) => (b ? t('common.yes') : t('common.no'));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('admin.title')}</h1>
          <p className="muted">{t('admin.subtitle')}</p>
        </div>
      </div>

      <section className="admin-section card">
        <h2>{t('admin.sampleData')}</h2>
        <p>{t('admin.sampleExplain')}</p>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={seed}
            disabled={seeding}
          >
            {seeding ? t('common.importing') : t('common.importSample')}
          </button>
        </div>
        {seedError && <p className="error">{seedError}</p>}
        {result && (
          <div>
            <p>
              {t('admin.result', {
                imported: result.imported,
                skipped: result.skipped,
                converted: result.converted,
              })}
            </p>
            {result.failed.length > 0 && (
              <>
                <h3>{t('admin.failed', { count: result.failed.length })}</h3>
                <ul>
                  {result.failed.map((f) => (
                    <li key={f.name}>
                      <strong>{f.name}</strong>
                      <span className="muted"> - {f.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <section className="admin-section card">
        <h2>{t('admin.resetTitle')}</h2>
        <p>{t('admin.resetExplain')}</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => reset(false, true)}
            disabled={resetting || seeding}
          >
            {resetting ? t('admin.resetting') : t('admin.clearProjects')}
          </button>
          <button
            type="button"
            className="btn"
            style={{ color: '#b42318', borderColor: '#b42318' }}
            onClick={() => reset(false)}
            disabled={resetting || seeding}
          >
            {resetting ? t('admin.resetting') : t('admin.resetEmpty')}
          </button>
          <button
            type="button"
            className="btn"
            style={{ color: '#b42318', borderColor: '#b42318' }}
            onClick={() => reset(true)}
            disabled={resetting || seeding}
          >
            {resetting ? t('admin.resetting') : t('admin.resetSamples')}
          </button>
        </div>
        {resetError && <p className="error">{resetError}</p>}
      </section>

      <section className="admin-section card">
        <h2>{t('admin.status')}</h2>
        {error && <p className="error">{error}</p>}
        {!status && !error && <p className="muted">{t('common.loading')}</p>}
        {status && (
          <dl className="kv">
            <dt>{t('admin.ai')}</dt>
            <dd>
              {status.ai.enabled
                ? `${status.ai.provider} / ${status.ai.model ?? '-'}${status.ai.project ? ` (${status.ai.project})` : ''}`
                : t('admin.aiOff')}
            </dd>
            <dt>{t('admin.storage')}</dt>
            <dd>
              {status.storage.backend}
              {status.storage.bucket ? ` (${status.storage.bucket})` : ''}
            </dd>
            <dt>Pandoc</dt>
            <dd>{yn(status.converters.pandoc)}</dd>
            <dt>LibreOffice</dt>
            <dd>{yn(status.converters.libreoffice)}</dd>
            <dt>{t('admin.counts')}</dt>
            <dd>
              {t('admin.countsLine', {
                projects: status.counts.projects,
                docs: status.counts.project_docs,
                templates: status.counts.templates,
                users: status.counts.users,
              })}
            </dd>
          </dl>
        )}
      </section>
    </div>
  );
}
