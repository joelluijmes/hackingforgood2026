import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  type Lang,
  type ProjectDoc,
  type ReviewComment,
  type VersionDetail,
  type VersionHtml,
} from '../api';
import CommentPanel from '../components/CommentPanel';
import '../review.css';

const rootIn = (list: ReviewComment[], c: ReviewComment) =>
  (c.parent_id !== null && list.find((x) => x.id === c.parent_id)) || c;

export default function VersionViewer() {
  const vid = Number(useParams().vid);
  const nav = useNavigate();
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [html, setHtml] = useState<VersionHtml | null>(null);
  const [htmlErr, setHtmlErr] = useState('');
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [lang, setLang] = useState<Lang>('en');
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [error, setError] = useState('');
  const [showTc, setShowTc] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<ReviewComment[]>([]);
  commentsRef.current = comments;

  useEffect(() => {
    let live = true;
    setDetail(null);
    setHtml(null);
    setHtmlErr('');
    setComments([]);
    setActiveId(null);
    setError('');
    (async () => {
      try {
        const [d, me] = await Promise.all([api.getVersion(vid), api.me()]);
        if (!live) return;
        setDetail(d);
        setLang(me.language);
        api.listProjectDocs(d.project.id).then(
          (x) => live && setDocs(x),
          () => {},
        );
        api.listComments(vid, me.language).then(
          (x) => live && setComments(x),
          (e) => live && setError(String(e.message ?? e)),
        );
        if (d.version.preview === 'docx') {
          api.getVersionHtml(vid).then(
            (h) => live && setHtml(h),
            (e) => live && setHtmlErr(String(e.message ?? e)),
          );
        } else
          setHtmlErr('This file type cannot be rendered. Download it instead.');
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [vid]);

  const spansFor = useCallback((ext: string) => {
    const root = paper.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('span.cmt')).filter(
      (s) => (s.dataset.cid ?? '').split(/\s+/).includes(ext),
    );
  }, []);

  const activate = useCallback(
    (c: ReviewComment) => {
      setActiveId(c.id);
      const spans = spansFor(rootIn(commentsRef.current, c).ext_id);
      const first = spans[0];
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        for (const s of spans) {
          s.classList.remove('flash');
          void s.offsetWidth;
          s.classList.add('flash');
        }
      }
      document
        .getElementById(`rv-c-${c.id}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [spansFor],
  );

  // highlight the active range
  // biome-ignore lint/correctness/useExhaustiveDependencies: html drives re-query
  useEffect(() => {
    const root = paper.current;
    if (!root) return;
    for (const s of root.querySelectorAll('span.cmt.active'))
      s.classList.remove('active');
    const c = comments.find((x) => x.id === activeId);
    if (c)
      for (const s of spansFor(rootIn(commentsRef.current, c).ext_id))
        s.classList.add('active');
  }, [activeId, html, comments, spansFor]);

  const onDocClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('span.cmt');
    if (!el) return;
    const ids = (el.dataset.cid ?? '').split(/\s+/);
    const cur = comments.find((c) => c.id === activeId);
    const matches = comments.filter(
      (c) => c.parent_id === null && ids.includes(c.ext_id),
    );
    if (!matches.length) return;
    const i = cur ? matches.findIndex((m) => m.id === cur.id) : -1;
    activate(matches[(i + 1) % matches.length]);
  };

  if (error && !detail) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/">Back to projects</Link>
      </div>
    );
  }
  if (!detail) return <div className="page muted">Loading…</div>;

  const { version, doc, project } = detail;
  const versions = docs.find((d) => d.id === doc.id)?.versions ?? [version];
  const prev = versions
    .filter((v) => v.number < version.number)
    .sort((a, b) => b.number - a.number)[0];

  return (
    <div className="page wide">
      <div className="rv-head">
        <div className="rv-crumb">
          <Link to={`/projects/${project.id}`}>{project.name}</Link> ›{' '}
          {doc.title}
        </div>
        <h1>{doc.title}</h1>
        <select
          aria-label="Version"
          value={vid}
          onChange={(e) => nav(`/versions/${e.target.value}`)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} · {v.source}
            </option>
          ))}
        </select>
        <a className="btn" href={api.versionFileUrl(vid)}>
          Download
        </a>
        {prev && (
          <Link className="btn" to={`/diff?from=${prev.id}&to=${vid}`}>
            Compare with previous version
          </Link>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="rv-cols">
        <div>
          <div className="rv-doc-tools">
            <label>
              <input
                type="checkbox"
                checked={showTc}
                onChange={(e) => setShowTc(e.target.checked)}
              />
              Show tracked changes
            </label>
            <span className="muted">
              {version.filename} · v{version.number}
            </span>
          </div>
          {htmlErr && <div className="empty">{htmlErr}</div>}
          {!html && !htmlErr && (
            <div className="muted">Rendering document…</div>
          )}
          {html && (
            // biome-ignore lint/a11y/useKeyWithClickEvents: comments are also reachable via the panel
            // biome-ignore lint/a11y/noStaticElementInteractions: delegated click on highlights
            <div
              ref={paper}
              className={`paper ${showTc ? '' : 'hide-tc'}`}
              onClick={onDocClick}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped server-side
              dangerouslySetInnerHTML={{ __html: html.html }}
            />
          )}
        </div>
        <CommentPanel
          comments={comments}
          setComments={setComments}
          lang={lang}
          activeId={activeId}
          onActivate={activate}
        />
      </div>
    </div>
  );
}
