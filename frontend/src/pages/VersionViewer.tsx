import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  type Lang,
  type ProjectDoc,
  type ReviewComment,
  type VersionDetail,
  type VersionHtml,
} from '../api';
import CommentPanel from '../components/CommentPanel';
import EditPanel from '../components/EditPanel';
import InterpreterPanel from '../components/InterpreterPanel';
import PropagateDialog from '../components/PropagateDialog';
import { isLang } from '../i18n';
import '../review.css';

const rootIn = (list: ReviewComment[], c: ReviewComment) =>
  (c.parent_id !== null && list.find((x) => x.id === c.parent_id)) || c;

export default function VersionViewer() {
  const { t, i18n } = useTranslation();
  const lang = (isLang(i18n.language) ? i18n.language : 'en') as Lang;
  const vid = Number(useParams().vid);
  const nav = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<'comments' | 'edit' | 'interpreter'>(
    'comments',
  );
  const [interpreterOpen, setInterpreterOpen] = useState(false);
  const [fixing, setFixing] = useState<ReviewComment | null>(null);
  const [changeId, setChangeId] = useState<number | null>(null);
  // after "apply", the new version is opened with the change id to offer propagation
  useEffect(() => {
    const id = (location.state as { changeId?: number } | null)?.changeId;
    if (id) setChangeId(id);
  }, [location.state]);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [html, setHtml] = useState<VersionHtml | null>(null);
  const [htmlErr, setHtmlErr] = useState('');
  const [noRender, setNoRender] = useState(false);
  const [comments, setComments] = useState<ReviewComment[]>([]);
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
    setNoRender(false);
    setComments([]);
    setActiveId(null);
    setError('');
    setFixing(null);
    (async () => {
      try {
        const d = await api.getVersion(vid);
        if (!live) return;
        setDetail(d);
        api.listProjectDocs(d.project.id).then(
          (x) => live && setDocs(x),
          () => {},
        );
        if (d.version.preview === 'docx') {
          api.getVersionHtml(vid).then(
            (h) => live && setHtml(h),
            (e) => live && setHtmlErr(String(e.message ?? e)),
          );
        } else setNoRender(true);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [vid]);

  useEffect(() => {
    if (!html || !location.hash) return;
    const anchor = decodeURIComponent(location.hash.slice(1));
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [html, location.hash]);

  useEffect(() => {
    if (!html || !location.hash) return;
    const anchor = decodeURIComponent(location.hash.slice(1));
    requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [html, location.hash]);

  // Comments are translated into the UI language, so reload them when it changes.
  useEffect(() => {
    let live = true;
    api.listComments(vid, lang).then(
      (x) => live && setComments(x),
      (e) => live && setError(String(e.message ?? e)),
    );
    return () => {
      live = false;
    };
  }, [vid, lang]);

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
        <Link to="/">{t('common.backToProjects')}</Link>
      </div>
    );
  }
  if (!detail) return <div className="page muted">{t('common.loading')}</div>;

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
          aria-label={t('versionViewer.versionLabel')}
          value={vid}
          onChange={(e) => nav(`/versions/${e.target.value}`)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.number} · {t(`sources.${v.source}`)}
            </option>
          ))}
        </select>
        <a className="btn" href={api.versionFileUrl(vid)}>
          {t('common.download')}
        </a>
        {prev && (
          <Link className="btn" to={`/diff?from=${prev.id}&to=${vid}`}>
            {t('versionViewer.compareWithPrevious')}
          </Link>
        )}
        {comments.length > 0 && (
          <a className="btn" href={api.ecResponseUrl(vid, lang)}>
            {t('versionViewer.ecResponse')}
          </a>
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
              {t('versionViewer.showTrackedChanges')}
            </label>
            <span className="muted">
              {version.filename} · v{version.number}
            </span>
          </div>
          {htmlErr && <div className="empty">{htmlErr}</div>}
          {noRender && (
            <div className="empty">{t('versionViewer.notRenderable')}</div>
          )}
          {!html && !htmlErr && !noRender && (
            <div className="muted">{t('versionViewer.rendering')}</div>
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
        <div className="rv-side">
          <div className="rv-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'comments'}
              onClick={() => setTab('comments')}
            >
              {t('versionViewer.tabComments')}
              {comments.length > 0 && ` (${comments.length})`}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'edit'}
              disabled={version.preview !== 'docx'}
              onClick={() => setTab('edit')}
            >
              {t('versionViewer.tabEdit')}
            </button>
            {doc.role === 'icf' && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'interpreter'}
                onClick={() => {
                  setInterpreterOpen(true);
                  setTab('interpreter');
                }}
              >
                {t('versionViewer.tabInterpreter')}
              </button>
            )}
          </div>
          {tab === 'comments' ? (
            <CommentPanel
              comments={comments}
              setComments={setComments}
              lang={lang}
              activeId={activeId}
              onActivate={activate}
              onFix={(c) => {
                activate(c);
                setFixing(c);
                setTab('edit');
              }}
            />
          ) : tab === 'edit' ? (
            <EditPanel
              key={vid}
              vid={vid}
              icfType={doc.icf_type}
              language={doc.language}
              lang={lang}
              comment={fixing}
              onClearComment={() => setFixing(null)}
              onApplied={(r) =>
                nav(`/versions/${r.version.id}`, {
                  state: { changeId: r.change_id },
                })
              }
            />
          ) : null}
          {doc.role === 'icf' && interpreterOpen && (
            <div
              className="rv-interpreter-holder"
              hidden={tab !== 'interpreter'}
            >
              <InterpreterPanel key={doc.id} icfId={doc.id} uiLanguage={lang} />
            </div>
          )}
        </div>
      </div>
      {changeId !== null && (
        <PropagateDialog
          changeId={changeId}
          onClose={() => {
            setChangeId(null);
            nav('.', { replace: true, state: null });
          }}
        />
      )}
    </div>
  );
}
