import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type CommentStatus,
  type Lang,
  type ReviewComment,
  type Version,
} from '../api';
import { formatDate } from '../format';
import '../review.css';

type Filter = 'all' | CommentStatus;
const trunc = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Legacy drafts carried one "filled, please verify" comment per fill; those are fill markers now. */
const isLegacyFill = (c: ReviewComment) =>
  c.author === 'ICF Studio' && c.text.startsWith('Filled from sponsor');

/** Read-only comment body: author, language, quote and text in the user's language. */

export function CommentBody({ c, lang }: { c: ReviewComment; lang: Lang }) {
  const { t, i18n } = useTranslation();
  const [orig, setOrig] = useState(false);
  const translated = !!c.translated_text && c.translated_to === lang;
  const differs = !!c.language && c.language !== lang;
  return (
    <>
      <div className="rv-meta">
        <span className="rv-avatar" aria-hidden="true">
          {c.initials || c.author.slice(0, 2)}
        </span>
        <span className="who">{c.author}</span>
        <span className="muted">
          {c.date ? formatDate(c.date, i18n.language) : ''}
        </span>
        {c.language && (
          <span className="rv-pill">{c.language.toUpperCase()}</span>
        )}
      </div>
      {c.anchor_text && (
        <blockquote className="rv-quote">{trunc(c.anchor_text)}</blockquote>
      )}
      <p className="rv-text">
        {translated && !orig ? c.translated_text : c.text}
      </p>
      {translated && (
        <div className="rv-note">
          {t('comments.translatedFrom', {
            language: c.language ? t(`languages.${c.language}`) : '',
          })}{' '}
          ·{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOrig(!orig);
            }}
          >
            {orig ? t('comments.showTranslation') : t('comments.showOriginal')}
          </button>
        </div>
      )}
      {differs && !translated && (
        <div className="rv-note">{t('comments.translationUnavailable')}</div>
      )}
    </>
  );
}

/** A locally staged review change; nothing is sent until "Apply". */
export type Staged =
  | { kind: 'decision'; status: CommentStatus; note?: string }
  | { kind: 'text'; text: string };

/** Generator gap comments ("Missing: ... - please add this information"). */
const isGap = (c: ReviewComment) =>
  c.author === 'ICF Studio' && c.text.startsWith('Missing:');

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function Decide({
  c,
  staged,
  onStage,
  onFix,
}: {
  c: ReviewComment;
  staged: Staged | undefined;
  onStage: (c: ReviewComment, s: Staged | null) => void;
  onFix?: (c: ReviewComment) => void;
}) {
  const { t, i18n } = useTranslation();
  const [providing, setProviding] = useState(false);
  const [text, setText] = useState('');
  const gap = isGap(c);
  if (staged) {
    return (
      <div className="rv-actions">
        <span className="rv-status staged">{describe(t, staged, gap, 60)}</span>
        <button
          type="button"
          className="rv-undo"
          onClick={(e) => {
            stop(e);
            onStage(c, null);
          }}
        >
          {t('comments.unstage')}
        </button>
      </div>
    );
  }
  if (c.status !== 'open') {
    return (
      <div className="rv-actions">
        <span className={`rv-status ${c.status}`}>
          {c.status === 'approved'
            ? t('comments.statusApproved')
            : t('comments.statusDeclined')}
          {c.decided_by
            ? ` ${t('comments.decidedBy', { name: c.decided_by })}`
            : ''}
          {c.decided_at ? ` · ${formatDate(c.decided_at, i18n.language)}` : ''}
        </span>
        <button
          type="button"
          className="rv-undo"
          onClick={(e) => {
            stop(e);
            onStage(c, { kind: 'decision', status: 'open' });
          }}
        >
          {t('comments.undo')}
        </button>
        {c.decision_note && (
          <div className="rv-note">
            {t('comments.decisionNote', { note: c.decision_note })}
          </div>
        )}
      </div>
    );
  }
  if (gap) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: stops card click only
      <div className="rv-decide" onClick={stop} onKeyDown={stop}>
        {providing ? (
          <>
            <textarea
              rows={2}
              // biome-ignore lint/a11y/noAutofocus: opened by an explicit click
              autoFocus
              placeholder={t('comments.provideText')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="rv-actions">
              <button
                type="button"
                className="btn primary"
                disabled={!text.trim()}
                onClick={() => {
                  onStage(c, { kind: 'text', text: text.trim() });
                  setProviding(false);
                  setText('');
                }}
              >
                {t('comments.stage')}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setProviding(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        ) : (
          <div className="rv-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setProviding(true)}
            >
              {t('comments.provideText')}
            </button>
            {onFix && (
              <button
                type="button"
                className="btn outline"
                onClick={() => onFix(c)}
              >
                {t('comments.fixWithAi')}
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                onStage(c, {
                  kind: 'decision',
                  status: 'approved',
                  note: t('comments.leftAsPlaceholder'),
                })
              }
            >
              {t('comments.leave')}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="rv-actions">
      <button
        type="button"
        className="btn primary"
        onClick={(e) => {
          stop(e);
          onStage(c, { kind: 'decision', status: 'approved' });
        }}
      >
        {t('comments.approve')}
      </button>
      <button
        type="button"
        className="btn outline"
        onClick={(e) => {
          stop(e);
          onStage(c, { kind: 'decision', status: 'declined' });
        }}
      >
        {t('comments.decline')}
      </button>
      {onFix && (
        <button
          type="button"
          className="btn ghost"
          onClick={(e) => {
            stop(e);
            onFix(c);
          }}
        >
          {t('comments.fixWithAi')}
        </button>
      )}
    </div>
  );
}

function describe(t: TFunction, s: Staged, gap: boolean, n: number) {
  if (s.kind === 'text')
    return t('comments.stagedText', { text: trunc(s.text, n) });
  if (s.status === 'open') return t('comments.stagedReopen');
  if (gap) return t('comments.stagedLeave');
  return s.status === 'approved'
    ? t('comments.stagedResolve')
    : t('comments.stagedDismiss');
}

export default function CommentPanel({
  vid,
  comments,
  setComments,
  lang,
  activeId,
  onActivate,
  onFix,
  onApplied,
  fillCount = 0,
  showFills = false,
  onToggleFills,
}: {
  vid: number;
  fillCount?: number;
  showFills?: boolean;
  onToggleFills?: (v: boolean) => void;
  comments: ReviewComment[];
  setComments: (f: (prev: ReviewComment[]) => ReviewComment[]) => void;
  lang: Lang;
  activeId: number | null;
  onActivate: (c: ReviewComment) => void;
  onFix?: (c: ReviewComment) => void;
  /** a batch with text replacements created a new version */
  onApplied?: (v: Version) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [staged, setStaged] = useState<Record<number, Staged>>({});
  const [tray, setTray] = useState(false);
  const [busy, setBusy] = useState(false);
  // staged changes are shown instantly as if already saved
  const list = useMemo(
    () =>
      comments
        .filter((c) => !isLegacyFill(c))
        .map((c) => {
          const s = staged[c.id];
          if (!s) return c;
          const status: CommentStatus =
            s.kind === 'text' ? 'approved' : s.status;
          return { ...c, status };
        }),
    [comments, staged],
  );
  const stagedIds = Object.keys(staged).map(Number);

  const counts = useMemo(() => {
    const n = { all: list.length, open: 0, approved: 0, declined: 0 };
    for (const c of list) n[c.status]++;
    return n;
  }, [list]);

  const roots = list.filter((c) => c.parent_id === null);
  const repliesOf = (id: number) => list.filter((c) => c.parent_id === id);
  const shown = roots.filter(
    (c) =>
      filter === 'all' ||
      c.status === filter ||
      repliesOf(c.id).some((r) => r.status === filter),
  );
  const reviewed = counts.approved + counts.declined;

  const stage = (c: ReviewComment, s: Staged | null) =>
    setStaged((all) => {
      const { [c.id]: _drop, ...rest } = all;
      return s ? { ...rest, [c.id]: s } : rest;
    });

  const openNow = list.filter((c) => c.status === 'open');
  const openGaps = openNow.filter(isGap);
  const openOthers = openNow.filter((c) => !isGap(c));
  const bulk = (items: ReviewComment[], note?: string) =>
    setStaged((all) => {
      const next = { ...all };
      for (const c of items)
        next[c.id] = { kind: 'decision', status: 'approved', note };
      return next;
    });

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const decisions = stagedIds.flatMap((id) => {
        const s = staged[id];
        return s.kind === 'decision'
          ? [{ comment_id: id, status: s.status, note: s.note }]
          : [];
      });
      const replacements = stagedIds.flatMap((id) => {
        const s = staged[id];
        return s.kind === 'text' ? [{ comment_id: id, text: s.text }] : [];
      });
      const r = await api.commentBatch(vid, { decisions, replacements });
      setStaged({});
      setTray(false);
      if (r.version && onApplied) return onApplied(r.version);
      setComments(() => []);
      setComments(() => []);
      const fresh = await api.listComments(vid, lang);
      setComments(() => fresh);
      if (r.skipped.length) setError(r.skipped.map((x) => x.why).join('; '));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const nextOpen = () => {
    const open = roots.filter((c) => c.status === 'open');
    if (!open.length) return;
    const i = open.findIndex((c) => c.id === activeId);
    onActivate(open[(i + 1) % open.length]);
  };

  const card = (c: ReviewComment, reply = false) => (
    // biome-ignore lint/a11y/useSemanticElements: card contains buttons
    <div
      key={c.id}
      id={`rv-c-${c.id}`}
      className={`rv-card ${c.status} ${staged[c.id] ? 'staged' : ''} ${activeId === c.id ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onActivate(c)}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onActivate(c);
        }
      }}
    >
      <CommentBody c={c} lang={lang} />
      <Decide
        c={comments.find((x) => x.id === c.id) ?? c}
        staged={staged[c.id]}
        onStage={stage}
        onFix={reply ? undefined : onFix}
      />
      {!reply && repliesOf(c.id).length > 0 && (
        <div className="rv-replies">
          {repliesOf(c.id).map((r) => card(r, true))}
        </div>
      )}
    </div>
  );

  return (
    <aside className="rv-panel" aria-label={t('comments.title')}>
      <div className="rv-panel-head">
        <h2>{t('comments.title')}</h2>
        <div className="muted">
          {t('comments.reviewed', { done: reviewed, total: list.length })}
        </div>
        <div className="rv-progress">
          <div
            style={{
              width: `${list.length ? (reviewed / list.length) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="rv-filters">
          {(['all', 'open', 'approved', 'declined'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`comments.filters.${f}`)} ({counts[f]})
            </button>
          ))}
          <button type="button" onClick={nextOpen} disabled={!counts.open}>
            {t('comments.nextOpen')}
          </button>
        </div>
        {(openOthers.length > 0 || openGaps.length > 0) && (
          <div className="rv-filters">
            {openOthers.length > 0 && (
              <button type="button" onClick={() => bulk(openOthers)}>
                {t('comments.resolveAll', { count: openOthers.length })}
              </button>
            )}
            {openGaps.length > 0 && (
              <button
                type="button"
                onClick={() => bulk(openGaps, t('comments.leftAsPlaceholder'))}
              >
                {t('comments.leaveAll', { count: openGaps.length })}
              </button>
            )}
          </div>
        )}
        {fillCount > 0 && onToggleFills && (
          <label className="rv-gen">
            <input
              type="checkbox"
              checked={showFills}
              onChange={(e) => onToggleFills(e.target.checked)}
            />
            {t('comments.fillsSummary', { count: fillCount })} ·{' '}
            {t('comments.showFills')}
          </label>
        )}
        {error && <div className="rv-err">{error}</div>}
      </div>
      <div className="rv-list">
        {shown.length === 0 && (
          <div className="empty">
            {list.length
              ? t('comments.noneInFilter')
              : t('comments.noneInVersion')}
          </div>
        )}
        {shown.map((c) => card(c))}
      </div>
      {stagedIds.length > 0 && (
        <div className="rv-tray">
          {tray && (
            <ul className="rv-tray-list">
              {stagedIds.map((id) => {
                const c = comments.find((x) => x.id === id);
                const s = staged[id];
                return (
                  <li key={id}>
                    <div className="rv-tray-what">
                      <strong>
                        {trunc(c?.anchor_text || c?.text || '', 50)}
                      </strong>
                      {s.kind === 'text' ? (
                        <input
                          value={s.text}
                          aria-label={t('comments.provideText')}
                          onChange={(e) =>
                            setStaged((all) => ({
                              ...all,
                              [id]: { kind: 'text', text: e.target.value },
                            }))
                          }
                        />
                      ) : (
                        <span className="muted">
                          {describe(t, s, !!c && isGap(c), 80)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="rv-undo"
                      onClick={() => c && stage(c, null)}
                    >
                      {t('comments.unstage')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="rv-tray-bar">
            <strong>
              {t('comments.stagedCount', { count: stagedIds.length })}
            </strong>
            <button
              type="button"
              className="btn outline"
              onClick={() => setTray(!tray)}
            >
              {t('comments.reviewApply')}
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={apply}
            >
              {busy ? t('common.loading') : t('comments.applyAll')}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => setStaged({})}
            >
              {t('comments.discard')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
