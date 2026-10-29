import { useMemo, useState } from 'react';
import { api, type CommentStatus, type Lang, type ReviewComment } from '../api';
import '../review.css';

type Filter = 'all' | CommentStatus;
const fmt = (d: string | null) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString();
};
const trunc = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Read-only comment body: author, language, quote and text in the user's language. */
export function CommentBody({ c, lang }: { c: ReviewComment; lang: Lang }) {
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
        <span className="muted">{fmt(c.date)}</span>
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
          Translated from {c.language?.toUpperCase()} ·{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOrig(!orig);
            }}
          >
            {orig ? 'Show translation' : 'Show original'}
          </button>
        </div>
      )}
      {differs && !translated && (
        <div className="rv-note">Translation unavailable</div>
      )}
    </>
  );
}

function Decide({
  c,
  onDecide,
}: {
  c: ReviewComment;
  onDecide: (c: ReviewComment, s: CommentStatus, note?: string) => void;
}) {
  const [pending, setPending] = useState<CommentStatus | null>(null);
  const [note, setNote] = useState('');
  if (c.status !== 'open') {
    return (
      <div className="rv-actions">
        <span className={`rv-status ${c.status}`}>
          {c.status === 'approved' ? 'Approved' : 'Declined'}
          {c.decided_by ? ` by ${c.decided_by}` : ''}
          {c.decided_at ? ` · ${fmt(c.decided_at)}` : ''}
        </span>
        <button
          type="button"
          className="rv-undo"
          onClick={(e) => {
            e.stopPropagation();
            onDecide(c, 'open');
          }}
        >
          Undo
        </button>
        {c.decision_note && (
          <div className="rv-note">Note: {c.decision_note}</div>
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
          placeholder="Optional note"
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
            Confirm {pending === 'approved' ? 'approval' : 'decline'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setPending(null)}
          >
            Cancel
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
        Approve
      </button>
      <button
        type="button"
        className="btn outline"
        onClick={(e) => {
          e.stopPropagation();
          setPending('declined');
        }}
      >
        Decline
      </button>
    </div>
  );
}

export default function CommentPanel({
  comments,
  setComments,
  lang,
  activeId,
  onActivate,
}: {
  comments: ReviewComment[];
  setComments: (f: (prev: ReviewComment[]) => ReviewComment[]) => void;
  lang: Lang;
  activeId: number | null;
  onActivate: (c: ReviewComment) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');

  const counts = useMemo(() => {
    const n = { all: comments.length, open: 0, approved: 0, declined: 0 };
    for (const c of comments) n[c.status]++;
    return n;
  }, [comments]);

  const roots = comments.filter((c) => c.parent_id === null);
  const repliesOf = (id: number) => comments.filter((c) => c.parent_id === id);
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
      <Decide c={c} onDecide={decide} />
      {!reply && repliesOf(c.id).length > 0 && (
        <div className="rv-replies">
          {repliesOf(c.id).map((r) => card(r, true))}
        </div>
      )}
    </div>
  );

  return (
    <aside className="rv-panel" aria-label="Comments">
      <div className="rv-panel-head">
        <h2>Comments</h2>
        <div className="muted">
          {reviewed} of {comments.length} reviewed
        </div>
        <div className="rv-progress">
          <div
            style={{
              width: `${comments.length ? (reviewed / comments.length) * 100 : 0}%`,
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
              {f[0].toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
          <button type="button" onClick={nextOpen} disabled={!counts.open}>
            Next open
          </button>
        </div>
        {error && <div className="rv-err">{error}</div>}
      </div>
      <div className="rv-list">
        {shown.length === 0 && (
          <div className="empty">
            {comments.length
              ? 'No comments in this filter.'
              : 'No comments in this version.'}
          </div>
        )}
        {shown.map((c) => card(c))}
      </div>
    </aside>
  );
}
