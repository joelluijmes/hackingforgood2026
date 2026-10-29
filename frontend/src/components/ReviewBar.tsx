import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  type Lang,
  type Project,
  type ProjectDoc,
  type ReviewComment,
  type Version,
} from '../api';
import { describe, isGap, isLegacyFill, type Staged } from './CommentPanel';

type Choice = 'save' | 'approve' | 'request';

/** GitHub-style "Finish your review" bar: progress, staged changes and one submit action. */
export default function ReviewBar({
  vid,
  doc,
  project,
  comments,
  staged,
  setStaged,
  lang,
  onSaved,
}: {
  vid: number;
  doc: Pick<ProjectDoc, 'id'>;
  project: Pick<Project, 'id'>;
  comments: ReviewComment[];
  staged: Record<number, Staged>;
  setStaged: (f: (p: Record<number, Staged>) => Record<number, Staged>) => void;
  lang: Lang;
  /** saved while staying in review; `version` is set when text was replaced, else fresh comments */
  onSaved: (version: Version | null, fresh: ReviewComment[] | null) => void;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>('save');
  const [note, setNote] = useState('');
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ids = Object.keys(staged).map(Number);
  const stat = useMemo(() => {
    const live = comments.filter((c) => !isLegacyFill(c));
    let texts = 0;
    let resolved = 0;
    let dismissed = 0;
    let left = 0;
    let reopened = 0;
    for (const [k, s] of Object.entries(staged)) {
      const c = live.find((x) => x.id === Number(k));
      if (s.kind === 'text') texts++;
      else if (s.status === 'open') reopened++;
      else if (s.status === 'declined') dismissed++;
      else if (c && isGap(c)) left++;
      else resolved++;
    }
    const top = live.filter((c) => c.parent_id === null);
    const status = (c: ReviewComment) => {
      const s = staged[c.id];
      return s ? (s.kind === 'text' ? 'approved' : s.status) : c.status;
    };
    return {
      texts,
      resolved,
      dismissed,
      left,
      reopened,
      total: top.length,
      reviewed: top.filter((c) => status(c) !== 'open').length,
      open: top.filter((c) => status(c) === 'open').length,
    };
  }, [comments, staged]);

  const needAnyway = choice === 'approve' && stat.open > 0 && !anyway;
  const label =
    choice === 'approve'
      ? t('review.submitApprove')
      : choice === 'request'
        ? t('review.submitRequest')
        : t('review.submitSave');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      let version: Version | null = null;
      if (ids.length) {
        const decisions = ids.flatMap((id) => {
          const s = staged[id];
          return s.kind === 'decision'
            ? [{ comment_id: id, status: s.status, note: s.note }]
            : [];
        });
        const replacements = ids.flatMap((id) => {
          const s = staged[id];
          return s.kind === 'text' ? [{ comment_id: id, text: s.text }] : [];
        });
        const r = await api.commentBatch(vid, {
          decisions,
          replacements,
          note: note.trim() || undefined,
        });
        version = r.version;
        if (r.skipped.length) setError(r.skipped.map((x) => x.why).join('; '));
      }
      setStaged(() => ({}));
      if (choice === 'approve') await api.approveDoc(doc.id);
      if (choice !== 'save') {
        nav(`/projects/${project.id}`, {
          state: {
            reviewDone: { choice, version: version ? version.number : null },
          },
        });
        return;
      }
      setOpen(false);
      setNote('');
      const fresh = version ? null : await api.listComments(vid, lang);
      onSaved(version, fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const opt = (v: Choice, title: string, hint: string) => (
    <label className={`rv-opt ${choice === v ? 'on' : ''}`}>
      <input
        type="radio"
        name="rv-choice"
        checked={choice === v}
        onChange={() => setChoice(v)}
      />
      <span>
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="rv-bar">
      <Link className="rv-back" to={`/projects/${project.id}`}>
        ← {t('review.backToProject')}
      </Link>
      <div className="rv-bar-info">
        <span className="rv-bar-count">
          {t('comments.reviewed', { done: stat.reviewed, total: stat.total })}
        </span>
        <progress
          value={stat.reviewed}
          max={Math.max(stat.total, 1)}
          aria-hidden="true"
        />
        {ids.length > 0 && (
          <span className="rv-badge">
            {t('comments.stagedCount', { count: ids.length })}
          </span>
        )}
        {ids.length > 0 && (
          <button
            type="button"
            className="rv-linkbtn"
            disabled={busy}
            onClick={() => setStaged(() => ({}))}
          >
            {t('comments.discard')}
          </button>
        )}
      </div>
      <div className="rv-finish">
        <button
          type="button"
          className="btn primary"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t('review.finish')} ▾
        </button>
        {open && (
          <div className="rv-pop" role="dialog" aria-label={t('review.finish')}>
            <h3>{t('review.finishTitle')}</h3>
            {ids.length > 0 ? (
              <ul className="rv-sum">
                {stat.texts > 0 && (
                  <li>{t('review.sumTexts', { count: stat.texts })}</li>
                )}
                {stat.resolved > 0 && (
                  <li>{t('review.sumResolved', { count: stat.resolved })}</li>
                )}
                {stat.dismissed > 0 && (
                  <li>{t('review.sumDismissed', { count: stat.dismissed })}</li>
                )}
                {stat.left > 0 && (
                  <li>{t('review.sumLeft', { count: stat.left })}</li>
                )}
                {stat.reopened > 0 && (
                  <li>{t('review.sumReopened', { count: stat.reopened })}</li>
                )}
              </ul>
            ) : (
              <p className="muted">{t('review.nothingStaged')}</p>
            )}
            {ids.length > 0 && (
              <details className="rv-tray-details">
                <summary>{t('comments.reviewApply')}</summary>
                <ul className="rv-tray-list">
                  {ids.map((id) => {
                    const c = comments.find((x) => x.id === id);
                    const s = staged[id];
                    return (
                      <li key={id}>
                        <div className="rv-tray-what">
                          <strong>
                            {(c?.anchor_text || c?.text || '').slice(0, 50)}
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
                          onClick={() =>
                            setStaged((all) => {
                              const { [id]: _d, ...rest } = all;
                              return rest;
                            })
                          }
                        >
                          {t('comments.unstage')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            <textarea
              rows={3}
              placeholder={t('review.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="rv-opts">
              {opt(
                'save',
                t('review.optSave'),
                ids.length ? t('review.optSaveHint') : t('review.optSaveNone'),
              )}
              {opt(
                'approve',
                t('review.optApprove'),
                t('review.optApproveHint'),
              )}
              {opt(
                'request',
                t('review.optRequest'),
                t('review.optRequestHint'),
              )}
            </div>
            {choice === 'approve' && stat.open > 0 && (
              <label className="rv-warn">
                <input
                  type="checkbox"
                  checked={anyway}
                  onChange={(e) => setAnyway(e.target.checked)}
                />
                {t('review.openWarn', { count: stat.open })}
              </label>
            )}
            {error && <div className="rv-err">{error}</div>}
            <div className="rv-actions">
              <button
                type="button"
                className="btn primary"
                disabled={
                  busy || needAnyway || (choice === 'save' && ids.length === 0)
                }
                onClick={submit}
              >
                {busy ? t('common.loading') : label}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
