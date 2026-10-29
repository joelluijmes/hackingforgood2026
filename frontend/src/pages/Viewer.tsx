import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api, type DocHtml, type Document } from '../api';
import { formatSize } from '../format';

type Color = 'purple' | 'black' | 'blue' | 'red';
const LEGEND: Color[] = ['purple', 'black', 'blue', 'red'];

export default function Viewer() {
  const { t, i18n } = useTranslation();
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
        <Link to="/templates">{t('versionViewer.backTemplates')}</Link>
      </div>
    );
  }
  if (!doc) return <div className="page muted">{t('common.loading')}</div>;

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
          <Link to="/templates" className="muted">
            {t('versionViewer.backTemplates')}
          </Link>
          <h1>{doc.name}</h1>
          <div className="chips">
            <span className="chip">{t(`kinds.${doc.kind}`)}</span>
            {doc.language && (
              <span className="chip lang">{doc.language.toUpperCase()}</span>
            )}
            {doc.audience && (
              <span className="chip">{t(`icfTypes.${doc.audience}`)}</span>
            )}
            {doc.version && <span className="chip">v {doc.version}</span>}
            {doc.study && <span className="chip study">{doc.study}</span>}
            <span className="muted">{formatSize(doc.size, i18n.language)}</span>
          </div>
        </div>
        <a className="btn" href={api.fileUrl(doc.id)}>
          {t('common.download')}
        </a>
      </div>

      {doc.preview === 'pdf' && (
        <iframe className="pdf" title={doc.name} src={api.fileUrl(doc.id)} />
      )}
      {doc.preview === 'none' && (
        <div className="empty">
          <h3>{t('viewer.noPreview')}</h3>
          <p>{t('viewer.downloadOnly', { filename: doc.filename })}</p>
          <a className="btn primary" href={api.fileUrl(doc.id)}>
            {t('viewer.downloadFile')}
          </a>
        </div>
      )}

      {doc.preview === 'docx' && (
        <>
          {content && (
            <div className="stats">
              <div>
                <strong>{content.stats.words}</strong>{' '}
                {t('viewer.words', { count: content.stats.words })}
              </div>
              <div>
                <strong>{content.stats.paragraphs}</strong>{' '}
                {t('viewer.paragraphs', { count: content.stats.paragraphs })}
              </div>
              <div>
                <strong>{content.stats.tables}</strong>{' '}
                {t('viewer.tables', { count: content.stats.tables })}
              </div>
              <div>
                <strong>{content.headings.length}</strong>{' '}
                {t('viewer.headings', { count: content.headings.length })}
              </div>
            </div>
          )}
          <div className="viewer">
            <aside className="sidebar">
              {doc.kind === 'template' && colors && (
                <section className="legend" aria-label={t('viewer.colourCode')}>
                  <h4>{t('viewer.colourCode')}</h4>
                  {LEGEND.map((l) => (
                    <div
                      key={l}
                      className={`legend-row${dim[l] ? ' off' : ''}`}
                    >
                      <span className={`swatch s-${l}`} />
                      <span className="legend-text">
                        <b>{t(`viewer.colours.${l}.label`)}</b> · {colors[l]}
                        <small>{t(`viewer.colours.${l}.hint`)}</small>
                      </span>
                      <button
                        type="button"
                        className={`mini${focus === l ? ' on' : ''}`}
                        title={t('viewer.soloTitle')}
                        aria-pressed={focus === l}
                        onClick={() => setFocus(focus === l ? null : l)}
                      >
                        {t('viewer.solo')}
                      </button>
                      <button
                        type="button"
                        className="mini"
                        aria-pressed={dim[l]}
                        title={t('viewer.dimTitle')}
                        onClick={() => setDim((s) => ({ ...s, [l]: !s[l] }))}
                      >
                        {dim[l] ? t('viewer.show') : t('viewer.dim')}
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <nav aria-label={t('viewer.outline')}>
                <h4>{t('viewer.outline')}</h4>
                {content && content.headings.length === 0 && (
                  <p className="muted">{t('viewer.noHeadings')}</p>
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
              <div className="paper muted">{t('viewer.rendering')}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
