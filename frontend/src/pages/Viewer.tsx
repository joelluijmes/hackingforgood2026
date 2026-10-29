import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type DocHtml, type Document, formatSize } from '../api';

type Color = 'purple' | 'black' | 'blue' | 'red';
const LEGEND: { key: Color; label: string; hint: string }[] = [
  { key: 'purple', label: 'Purple', hint: 'Mandatory text' },
  { key: 'black', label: 'Black', hint: 'Proposal text' },
  { key: 'blue', label: 'Blue', hint: 'Trial-specific fill-in' },
  { key: 'red', label: 'Red', hint: 'Guidance' },
];

export default function Viewer() {
  const { id } = useParams();
  const docId = Number(id);
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState<DocHtml | null>(null);
  const [error, setError] = useState('');
  const [dim, setDim] = useState<Record<Color, boolean>>({
    purple: false,
    black: false,
    blue: false,
    red: false,
  });
  const [focus, setFocus] = useState<Color | null>(null);

  useEffect(() => {
    let live = true;
    setDoc(null);
    setContent(null);
    setError('');
    (async () => {
      try {
        const d = await api.getDocument(docId);
        if (!live) return;
        setDoc(d);
        if (d.preview === 'docx') {
          const h = await api.getHtml(docId);
          if (live) setContent(h);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [docId]);

  if (error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/">Back to library</Link>
      </div>
    );
  }
  if (!doc) return <div className="page muted">Loading…</div>;

  const jump = (anchor: string) =>
    document
      .getElementById(anchor)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const paperClass = [
    'paper',
    dim.purple && 'hide-purple',
    dim.blue && 'hide-blue',
    dim.red && 'hide-red',
    dim.black && 'hide-black',
    focus && `focus focus-${focus}`,
  ]
    .filter(Boolean)
    .join(' ');

  const colors = content?.stats.colors;

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <Link to="/" className="muted">
            ← Library
          </Link>
          <h1>{doc.name}</h1>
          <div className="chips">
            <span className="chip">{doc.kind}</span>
            {doc.language && (
              <span className="chip lang">{doc.language.toUpperCase()}</span>
            )}
            {doc.audience && <span className="chip">{doc.audience}</span>}
            {doc.version && <span className="chip">v {doc.version}</span>}
            {doc.study && <span className="chip study">{doc.study}</span>}
            <span className="muted">{formatSize(doc.size)}</span>
          </div>
        </div>
        <a className="btn" href={api.fileUrl(doc.id)}>
          Download
        </a>
      </div>

      {doc.preview === 'pdf' && (
        <iframe className="pdf" title={doc.name} src={api.fileUrl(doc.id)} />
      )}
      {doc.preview === 'none' && (
        <div className="empty">
          <h3>No preview available</h3>
          <p>{doc.filename} can only be downloaded.</p>
          <a className="btn primary" href={api.fileUrl(doc.id)}>
            Download file
          </a>
        </div>
      )}

      {doc.preview === 'docx' && (
        <>
          {content && (
            <div className="stats">
              <div>
                <strong>{content.stats.words}</strong> words
              </div>
              <div>
                <strong>{content.stats.paragraphs}</strong> paragraphs
              </div>
              <div>
                <strong>{content.stats.tables}</strong> tables
              </div>
              <div>
                <strong>{content.headings.length}</strong> headings
              </div>
            </div>
          )}
          <div className="viewer">
            <aside className="sidebar">
              {doc.kind === 'template' && colors && (
                <section className="legend" aria-label="Colour code">
                  <h4>Colour code</h4>
                  {LEGEND.map((l) => (
                    <div
                      key={l.key}
                      className={`legend-row${dim[l.key] ? ' off' : ''}`}
                    >
                      <span className={`swatch s-${l.key}`} />
                      <span className="legend-text">
                        <b>{l.label}</b> · {colors[l.key]}
                        <small>{l.hint}</small>
                      </span>
                      <button
                        type="button"
                        className={`mini${focus === l.key ? ' on' : ''}`}
                        title="Highlight only this colour"
                        aria-pressed={focus === l.key}
                        onClick={() => setFocus(focus === l.key ? null : l.key)}
                      >
                        Solo
                      </button>
                      <button
                        type="button"
                        className="mini"
                        aria-pressed={dim[l.key]}
                        title="Dim this colour"
                        onClick={() =>
                          setDim((s) => ({ ...s, [l.key]: !s[l.key] }))
                        }
                      >
                        {dim[l.key] ? 'Show' : 'Dim'}
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <nav aria-label="Outline">
                <h4>Outline</h4>
                {content && content.headings.length === 0 && (
                  <p className="muted">No headings found.</p>
                )}
                <ul className="outline">
                  {content?.headings.map((h) => (
                    <li
                      key={h.anchor}
                      style={{ paddingLeft: (h.level - 1) * 12 }}
                    >
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => jump(h.anchor)}
                      >
                        {h.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
            {content ? (
              <div className={paperClass}>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: backend escapes all text */}
                <div dangerouslySetInnerHTML={{ __html: content.html }} />
              </div>
            ) : (
              <div className="paper muted">Rendering document…</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
