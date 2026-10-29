import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type ProjectDoc, type Stage } from '../api';

const latest = (d: ProjectDoc) =>
  [...d.versions].sort((a, b) => b.number - a.number)[0];

export default function NextStepPanel({
  projectId,
  stage,
  docs,
  onUpload,
  onGenerate,
  onGenerateAll,
  onTranslateAll,
  onNewVersion,
}: {
  projectId: number;
  stage: Stage;
  docs: ProjectDoc[];
  onUpload: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
  onTranslateAll: () => void;
  onNewVersion: (d: ProjectDoc) => void;
}) {
  const { t } = useTranslation();
  const icfs = docs
    .filter((d) => d.role === 'icf' && latest(d))
    .sort((a, b) => (a.language ?? '').localeCompare(b.language ?? ''));
  const zip = (label: string) => (
    <a
      className="btn primary"
      href={api.projectExportUrl(projectId)}
      download
      style={{ display: 'inline-block' }}
    >
      {label}
    </a>
  );
  const list = (withUpload: boolean) =>
    icfs.length === 0 ? (
      <p className="muted">{t('project.next.noIcfs')}</p>
    ) : (
      <ul className="reqs">
        {icfs.map((d) => {
          const v = latest(d);
          return (
            <li key={d.id} className="req">
              <span>
                {d.title}{' '}
                <span className="muted small">
                  {t('project.next.latest', { n: v.number })}
                </span>
              </span>
              <Link className="link" to={`/versions/${v.id}`}>
                {t('project.next.openDraft')}
              </Link>
              <a className="link" href={api.versionFileUrl(v.id)} download>
                {t('project.next.download')}
              </a>
              {withUpload && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onNewVersion(d)}
                >
                  {t('project.next.uploadReviewed')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="stage-panel">
      <h3>{t('project.next.title')}</h3>
      {stage === 'intake' && (
        <>
          <p>{t('project.next.intake')}</p>
          <button type="button" className="btn primary" onClick={onUpload}>
            {t('project.next.uploadSponsor')}
          </button>
        </>
      )}
      {stage === 'drafting' && (
        <>
          <p>{t('project.next.drafting')}</p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={onGenerateAll}
            >
              {t('matrix.generateAll')}
            </button>
            <button type="button" className="btn" onClick={onGenerate}>
              {t('project.next.generateDraft')}
            </button>
          </div>
        </>
      )}
      {stage === 'pi_review' && (
        <>
          <p>{t('project.next.pi')}</p>
          {list(true)}
          <button type="button" className="btn" onClick={onTranslateAll}>
            {t('matrix.translateAll')}
          </button>
        </>
      )}
      {stage === 'ethics_review' && (
        <>
          <p>{t('project.next.ethics')}</p>
          {zip(t('project.next.downloadAll'))}
          {list(true)}
        </>
      )}
      {stage === 'approved' && (
        <>
          <p>{t('project.next.approved')}</p>
          {zip(t('project.next.downloadFinal'))}
          {list(false)}
        </>
      )}
    </section>
  );
}
