import { Link } from 'react-router-dom';
import { api, type ProjectDoc, type Version } from '../api';

function VersionRow({ v, prev }: { v: Version; prev: Version | undefined }) {
  return (
    <li className="ver">
      <div className="ver-main">
        <b>v{v.number}</b>
        <span className={`chip src-${v.source}`}>{v.source}</span>
        <span className="muted">
          {v.uploaded_by} · {new Date(v.uploaded_at).toLocaleDateString()}
        </span>
        {v.comments_total > 0 && (
          <span className="counts">
            <span className="chip warn">{v.comments_open} open</span>
            <span className="chip ok">{v.comments_approved} approved</span>
            <span className="chip bad">{v.comments_declined} declined</span>
          </span>
        )}
      </div>
      {v.note && <div className="ver-note">{v.note}</div>}
      <div className="row ver-actions">
        <Link className="link" to={`/versions/${v.id}`}>
          Open
        </Link>
        <a className="link" href={api.versionFileUrl(v.id)}>
          Download
        </a>
        {prev && (
          <Link className="link" to={`/diff?from=${prev.id}&to=${v.id}`}>
            Compare with previous
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
  return (
    <article className="card doc">
      <div className="doc-head">
        <div>
          <h3>{doc.title}</h3>
          <div className="chips">
            {doc.language && (
              <span className="chip lang">{doc.language.toUpperCase()}</span>
            )}
            {doc.icf_type && <span className="chip">{doc.icf_type}</span>}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={onNewVersion}>
            Upload new version
          </button>
          <button type="button" className="link danger" onClick={onDelete}>
            Delete
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
