import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type ProjectDoc, type Version } from '../api';
import { formatDate } from '../format';

function VersionRow({ v, prev }: { v: Version; prev: Version | undefined }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="ver">
      <div className="ver-main">
        <b>v{v.number}</b>
        <span className={`chip src-${v.source}`}>
          {t(`sources.${v.source}`)}
        </span>
        <span className="muted">
          {v.uploaded_by} · {formatDate(v.uploaded_at, i18n.language)}
        </span>
        {v.comments_total > 0 && (
          <span className="counts">
            <span className="chip warn">
              {t('project.countOpen', { count: v.comments_open })}
            </span>
            <span className="chip ok">
              {t('project.countApproved', { count: v.comments_approved })}
            </span>
            <span className="chip bad">
              {t('project.countDeclined', { count: v.comments_declined })}
            </span>
          </span>
        )}
      </div>
      {v.note && <div className="ver-note">{v.note}</div>}
      <div className="row ver-actions">
        <Link className="link" to={`/versions/${v.id}`}>
          {t('common.open')}
        </Link>
        <a className="link" href={api.versionFileUrl(v.id)}>
          {t('common.download')}
        </a>
        {prev && (
          <Link className="link" to={`/diff?from=${prev.id}&to=${v.id}`}>
            {t('project.compare')}
          </Link>
        )}
      </div>
    </li>
  );
}

export default function DocCard({
  doc,
  onNewVersion,
  onDelete,
}: {
  doc: ProjectDoc;
  onNewVersion: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="card doc">
      <div className="doc-head">
        <div>
          <h3>{doc.title}</h3>
          <div className="chips">
            {doc.language && (
              <span className="chip lang">{doc.language.toUpperCase()}</span>
            )}
            {doc.icf_type && (
              <span className="chip">{t(`icfTypes.${doc.icf_type}`)}</span>
            )}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={onNewVersion}>
            {t('project.uploadNewVersion')}
          </button>
          <button type="button" className="link danger" onClick={onDelete}>
            {t('common.delete')}
          </button>
        </div>
      </div>
      <ol className="timeline">
        {doc.versions.map((v, i) => (
          <VersionRow key={v.id} v={v} prev={doc.versions[i + 1]} />
        ))}
      </ol>
    </article>
  );
}
