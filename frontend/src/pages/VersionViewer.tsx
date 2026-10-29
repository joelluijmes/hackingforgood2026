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
import CommentPanel, { type Staged } from '../components/CommentPanel';
import EditPanel from '../components/EditPanel';
import PropagateDialog from '../components/PropagateDialog';
import ReviewBar from '../components/ReviewBar';
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
  const [tab, setTab] = useState<'comments' | 'edit'>('comments');
  const [fixing, setFixing] = useState<ReviewComment | null>(null);
  const [changeId, setChangeId] = useState<number | null>(null);
  const [staged, setStaged] = useState<Record<number, Staged>>({});
  // confirmation after "Finish review" (also carried over via navigation state)
  const [saved, setSaved] = useState<{ number: number | null } | null>(null);
  // after "apply", the new version is opened with the change id to offer propagation
  useEffect(() => {
    const id = (location.state as { changeId?: number } | null)?.changeId;
    if (id) setChangeId(id);
    const rs = (
      location.state as { reviewSaved?: { number: number | null } } | null
    )?.reviewSaved;
    if (rs) setSaved(rs);
  }, [location.state]);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [html, setHtml] = useState<VersionHtml | null>(null);
  const [htmlErr, setHtmlErr] = useState('');
  const [noRender, setNoRender] = useState(false);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [error, setError] = useState('');
  const [showTc, setShowTc] = useState(true);
  const [showFills, setShowFills] = useState(false);
  const [sel, setSel] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [addErr, setAddErr] = useState('');
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
    setStaged({});
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
      // centre the card inside the panel (not the page, the panel is sticky)
      const card = document.getElementById(`rv-c-${c.id}`);
      const box = card?.closest<HTMLElement>('.rv-panel');
      if (card && box) {
        const c0 = card.getBoundingClientRect();
        const b0 = box.getBoundingClientRect();
        box.scrollTo({
          top: box.scrollTop + (c0.top - b0.top) - (b0.height - c0.height) / 2,
          behavior: 'smooth',
        });
      }
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
    const toc = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      'a.toc-link',
    );
    if (toc) {
      e.preventDefault();
      const id = toc.getAttribute('href')?.slice(1);
      const target = id ? paper.current?.querySelector(`[id="${id}"]`) : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
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

  const onSelect = () => {
    if (adding) return;
    const s = window.getSelection();
    const root = paper.current;
    if (!s || s.isCollapsed || !root || !s.rangeCount) return setSel(null);
    const r = s.getRangeAt(0);
    const text = s.toString().trim();
    if (!text || !root.contains(r.commonAncestorContainer)) return setSel(null);
    const rect = r.getBoundingClientRect();
    setSel({
      text,
      x: Math.min(rect.left, window.innerWidth - 280),
      y: rect.bottom + 6,
    });
  };

  const closeAdd = () => {
    setSel(null);
    setAdding(false);
    setDraft('');
    setAddErr('');
  };

  const submitAdd = async () => {
    if (!sel || !draft.trim()) return;
    try {
      const c = await api.addComment(vid, draft.trim(), sel.text);
      setComments((all) => [...all, c]);
      const h = await api.getVersionHtml(vid);
      setHtml(h);
      closeAdd();
      window.getSelection()?.removeAllRanges();
      setTab('comments');
      setActiveId(c.id);
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (error && !detail) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to="/projects">{t('common.backToProjects')}</Link>
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
        <div className="rv-title-row">
          <h1>{doc.title}</h1>
          <select
            className="rv-ver"
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
          <div className="rv-head-actions">
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
            <a className="btn" href={api.versionFileUrl(vid)}>
              {t('common.download')}
            </a>
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && (
        <div className="rv-saved" role="status">
          <span>
            {saved.number !== null
              ? t('review.savedVersion', { number: saved.number })
              : t('review.savedDecisions')}{' '}
            {t('review.nextStep')}
          </span>
          <Link className="btn" to={`/projects/${project.id}`}>
            {t('review.backToProject')}
          </Link>
          {prev && saved.number !== null && (
            <Link className="btn" to={`/diff?from=${prev.id}&to=${vid}`}>
              {t('versionViewer.compareWithPrevious')}
            </Link>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setSaved(null)}
          >
            {t('review.continue')}
          </button>
        </div>
      )}
      <ReviewBar
        vid={vid}
        doc={doc}
        project={project}
        comments={comments}
        staged={staged}
        setStaged={setStaged}
        lang={lang}
        onSaved={(v, fresh) => {
          if (v)
            nav(`/versions/${v.id}`, {
              state: { reviewSaved: { number: v.number } },
            });
          else {
            if (fresh) setComments(() => fresh);
            setSaved({ number: null });
          }
        }}
      />
      <div className="rv-cols">
        <div>
          <div className="rv-doc-tools">
            <span className="rv-doc-name" title={version.filename}>
              {version.filename} · v{version.number}
            </span>
            {(html?.fill_count ?? 0) > 0 && (
              <label className="rv-toggle">
                <input
                  type="checkbox"
                  checked={showFills}
                  onChange={(e) => setShowFills(e.target.checked)}
                />
                {t('comments.fillsSummary', { count: html?.fill_count ?? 0 })}
              </label>
            )}
            <label className="rv-toggle">
              <input
                type="checkbox"
                checked={showTc}
                onChange={(e) => setShowTc(e.target.checked)}
              />
              {t('versionViewer.showTrackedChanges')}
            </label>
          </div>
          {htmlErr && <div className="empty">{htmlErr}</div>}
          {noRender && (
            <div className="empty">{t('versionViewer.notRenderable')}</div>
          )}
          {!html && !htmlErr && !noRender && (
            <div className="muted">{t('versionViewer.rendering')}</div>
          )}
          {html && (
            // biome-ignore lint/a11y/noStaticElementInteractions: delegated click on highlights
            <div
              ref={paper}
              className={`paper ${showTc ? '' : 'hide-tc'} ${showFills ? 'show-fills' : ''}`}
              onClick={onDocClick}
              onMouseUp={onSelect}
              onKeyUp={onSelect}
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
          </div>
          {tab === 'comments' ? (
            <CommentPanel
              staged={staged}
              setStaged={setStaged}
              comments={comments}
              lang={lang}
              activeId={activeId}
              onActivate={activate}
              onFix={(c) => {
                activate(c);
                setFixing(c);
                setTab('edit');
              }}
            />
          ) : (
            <EditPanel
              key={vid}
              vid={vid}
              icfType={doc.icf_type}
              language={doc.language}
              lang={lang}
              comment={fixing}
              onClearComment={() => setFixing(null)}
              onApplied={(r) => nav(`/versions/${r.version.id}`)}
            />
          )}
        </div>
      </div>
      {sel && (
        <div
          className={`rv-add ${adding ? '' : 'collapsed'}`}
          style={{ left: sel.x, top: sel.y }}
        >
          {adding ? (
            <>
              <textarea
                rows={3}
                // biome-ignore lint/a11y/noAutofocus: opened by an explicit click
                autoFocus
                placeholder={t('comments.addPlaceholder')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {addErr && <div className="rv-err">{addErr}</div>}
              <div className="rv-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!draft.trim()}
                  onClick={submitAdd}
                >
                  {t('comments.addSave')}
                </button>
                <button type="button" className="btn ghost" onClick={closeAdd}>
                  {t('common.cancel')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => setAdding(true)}
            >
              {t('comments.addComment')}
            </button>
          )}
        </div>
      )}
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
