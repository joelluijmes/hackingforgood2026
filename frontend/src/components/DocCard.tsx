import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, type ProjectDoc, type Stage, type Version } from '../api';
import { docStatus } from '../docStatus';
import { formatDate } from '../format';

function VersionRow({
  v,
  prev,
  isIcf,
}: {
  v: Version;
  prev: Version | undefined;
  isIcf: boolean;
}) {
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
      {v.sources && v.sources.length > 0 && (
        <div className="ver-sources muted small">
          {t('trace.madeFrom')}{' '}
          {v.sources
            .map(
              (s) =>
                `${s.name}${s.version_number ? ` v${s.version_number}` : s.version ? ` ${s.version}` : ''}`,
            )
            .join(' · ')}
        </div>
      )}
      <div className="row ver-actions">
        <Link className="link" to={`/versions/${v.id}`}>
          {t('common.open')}
        </Link>
        {isIcf && v.preview === 'docx' && (
          <Link className="link" to={`/versions/${v.id}?tab=sources`}>
            {t('trace.tab')}
          </Link>
        )}
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
  onChanged,
  sourceTitle,
  stage,
}: {
  doc: ProjectDoc;
  sourceTitle?: string;
  stage?: Stage;
  onNewVersion: () => void;
  onDelete: () => void;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const latest = doc.versions[0];
  const st =
    latest && stage
      ? docStatus(stage, {
          ...latest,
          approved: doc.approved,
          language: doc.language,
        })
      : null;
  return (
    <details className="card doc collapsible">
      <summary>
        <span className="chev" aria-hidden="true" />
        <div className="doc-sum">
          <h3>{doc.title}</h3>
          <div className="chips">
            {doc.language && (
              <span className="chip lang">{doc.language.toUpperCase()}</span>
            )}
            {doc.icf_type && (
              <span className="chip">{t(`icfTypes.${doc.icf_type}`)}</span>
            )}
            {doc.role === 'icf' && latest && stage && (
              <span className={`chip st-${st?.tone}`}>
                {t(`docStatus.${st?.key}`)}
              </span>
            )}
            {latest && (
              <span className="muted small">
                v{latest.number}
                {latest.comments_open > 0 &&
                  ` · ${t('project.countOpen', { count: latest.comments_open })}`}
              </span>
            )}
          </div>
        </div>
      </summary>
      <div className="doc-body">
        {doc.source_doc_id && (
          <p className="muted small">
            {t('project.translatedFrom', { title: sourceTitle ?? '…' })}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={onNewVersion}>
            {t('project.uploadNewVersion')}
          </button>
          {doc.role === 'icf' &&
            (doc.approved ? (
              <button
                type="button"
                className="btn"
                onClick={() => api.unapproveDoc(doc.id).then(onChanged)}
              >
                {t('project.withdrawApproval')}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => api.approveDoc(doc.id).then(onChanged)}
              >
                {t('next.act.approveAsIs')}
              </button>
            ))}
          <button type="button" className="link danger" onClick={onDelete}>
            {t('common.delete')}
          </button>
        </div>
        <ol className="timeline">
          {doc.versions.map((v, i) => (
            <VersionRow
              key={v.id}
              v={v}
              prev={doc.versions[i + 1]}
              isIcf={doc.role === 'icf'}
            />
          ))}
        </ol>
      </div>
    </details>
  );
}
