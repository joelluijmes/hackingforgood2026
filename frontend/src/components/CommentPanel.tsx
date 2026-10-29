import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type CommentStatus, type Lang, type ReviewComment } from '../api';
import { formatDate } from '../format';
import '../review.css';

type Filter = 'all' | CommentStatus;
const trunc = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Read-only comment body: author, language, quote and text in the user's language. */
const isGenerated = (c: ReviewComment) => c.author === 'ICF Studio';

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

function Decide({
  c,
  onDecide,
  onFix,
}: {
  c: ReviewComment;
  onDecide: (c: ReviewComment, s: CommentStatus, note?: string) => void;
  onFix?: (c: ReviewComment) => void;
}) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<CommentStatus | null>(null);
  const [note, setNote] = useState('');
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
            e.stopPropagation();
            onDecide(c, 'open');
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
  if (pending) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: stops card click only
      <div
        className="rv-decide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <textarea
          rows={2}
          placeholder={t('comments.optionalNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="rv-actions">
          <button
            type="button"
            className={`btn ${pending === 'approved' ? 'primary' : 'outline'}`}
            onClick={() => {
              onDecide(c, pending, note.trim() || undefined);
              setPending(null);
              setNote('');
            }}
          >
            {pending === 'approved'
              ? t('comments.confirmApproval')
              : t('comments.confirmDecline')}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setPending(null)}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="rv-actions">
      <button
        type="button"
        className="btn primary"
        onClick={(e) => {
          e.stopPropagation();
          setPending('approved');
        }}
      >
        {t('comments.approve')}
      </button>
      <button
        type="button"
        className="btn outline"
        onClick={(e) => {
          e.stopPropagation();
          setPending('declined');
        }}
      >
        {t('comments.decline')}
      </button>
      {onFix && (
        <button
          type="button"
          className="btn ghost"
          onClick={(e) => {
            e.stopPropagation();
            onFix(c);
          }}
        >
          {t('comments.fixWithAi')}
        </button>
      )}
    </div>
  );
}

export default function CommentPanel({
  comments,
  setComments,
  lang,
  activeId,
  onActivate,
  onFix,
}: {
  comments: ReviewComment[];
  setComments: (f: (prev: ReviewComment[]) => ReviewComment[]) => void;
  lang: Lang;
  activeId: number | null;
  onActivate: (c: ReviewComment) => void;
  onFix?: (c: ReviewComment) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [genOverride, setGenOverride] = useState<boolean | null>(null);

  // Notes written by the app itself (gaps / filled placeholders) can bury the reviewers' comments.
  const generatedCount = comments.filter(isGenerated).length;
  const showGenerated = genOverride ?? generatedCount === comments.length;
  const list = useMemo(
    () => (showGenerated ? comments : comments.filter((c) => !isGenerated(c))),
    [comments, showGenerated],
  );

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

  const decide = async (
    c: ReviewComment,
    status: CommentStatus,
    note?: string,
  ) => {
    const prev = c;
    setError('');
    const me = '…';
    setComments((all) =>
      all.map((x) =>
        x.id === c.id
          ? {
              ...x,
              status,
              decision_note: note ?? null,
              decided_by: status === 'open' ? null : me,
              decided_at: status === 'open' ? null : new Date().toISOString(),
            }
          : x,
      ),
    );
    try {
      const saved = await api.decideComment(c.id, status, note);
      setComments((all) =>
        all.map((x) => (x.id === c.id ? { ...x, ...saved } : x)),
      );
    } catch (e) {
      setComments((all) => all.map((x) => (x.id === c.id ? prev : x)));
      setError(e instanceof Error ? e.message : String(e));
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
      className={`rv-card ${c.status} ${activeId === c.id ? 'active' : ''}`}
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
      <Decide c={c} onDecide={decide} onFix={reply ? undefined : onFix} />
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
        {generatedCount > 0 && generatedCount < comments.length && (
          <label className="rv-gen">
            <input
              type="checkbox"
              checked={showGenerated}
              onChange={(e) => setGenOverride(e.target.checked)}
            />
            {t('comments.showGenerated', { count: generatedCount })}
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
    </aside>
  );
}
