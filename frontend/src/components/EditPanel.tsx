import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ApplyResult,
  api,
  type ChatMessage,
  type EditProposal,
  type IcfType,
  type Lang,
  type PendingChange,
  type ReviewComment,
} from '../api';
import { CommentBody } from './CommentPanel';
import { errMsg } from './Dialog';
import EditCard from './EditCard';
import PropagateDialog from './PropagateDialog';

interface Turn extends ChatMessage {
  edits?: EditProposal[];
}

/** "Chat with the form": ask for a change, review the proposed edits, apply as tracked changes. */
export default function EditPanel({
  vid,
  icfType,
  language,
  lang,
  comment,
  onClearComment,
  onApplied,
}: {
  vid: number;
  icfType: IcfType | null;
  language: Lang | null;
  lang: Lang;
  comment: ReviewComment | null;
  onClearComment: () => void;
  onApplied: (r: ApplyResult) => void;
}) {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'chat' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<EditProposal[]>([]);
  const [on, setOn] = useState<Record<number, boolean>>({});
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [propIds, setPropIds] = useState<number[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadPending = useCallback(() => {
    api.pendingChanges(vid).then(
      (list) => {
        setPending(list);
        setSel((o) =>
          Object.fromEntries(list.map((c) => [c.id, o[c.id] ?? true])),
        );
      },
      () => {},
    );
  }, [vid]);
  useEffect(loadPending, [loadPending]);

  const picked = pending.filter((c) => sel[c.id]).map((c) => c.id);

  async function skipPicked() {
    await Promise.all(picked.map((id) => api.dismissChange(id))).catch(
      () => {},
    );
    loadPending();
  }

  useEffect(() => {
    if (comment) setInput(t('edit.defaultPrompt'));
  }, [comment, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, busy]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const history: ChatMessage[] = turns.map(({ role, text }) => ({
      role,
      text,
    }));
    setTurns((prev) => [...prev, { role: 'user', text: message }]);
    setInput('');
    setBusy('chat');
    setError('');
    try {
      const r = await api.chat(vid, {
        message,
        history,
        comment_id: comment?.id,
      });
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: r.reply || t('edit.defaultReply'),
          edits: r.edits,
        },
      ]);
      if (r.edits.length) {
        setEdits(r.edits);
        setOn(Object.fromEntries(r.edits.map((x) => [x.idx, true])));
        setInstruction(
          comment
            ? `EC comment (${comment.author}): ${comment.translated_text ?? comment.text}`
            : message,
        );
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    const chosen = edits.filter((x) => on[x.idx]);
    if (!chosen.length) return;
    setBusy('apply');
    setError('');
    try {
      const r = await api.applyEdits(vid, {
        edits: chosen.map(({ idx, old, new: n, reason }) => ({
          idx,
          old,
          new: n,
          reason,
        })),
        instruction,
        comment_id: comment?.id,
      });
      onApplied(r);
    } catch (err) {
      setError(errMsg(err));
      setBusy(null);
    }
  }

  const chosen = edits.filter((x) => on[x.idx]).length;

  return (
    <aside className="rv-panel ed-panel" aria-label={t('edit.title')}>
      <div className="rv-panel-head">
        <h2>{t('edit.title')}</h2>
        <div className="chips">
          {icfType && (
            <span className="chip">{t(`matrix.rows.${icfType}`)}</span>
          )}
          {language && (
            <span className="chip lang">{language.toUpperCase()}</span>
          )}
        </div>
        <p className="muted ed-hint">{t('edit.hint')}</p>
        {comment && (
          <div className="ed-ctx">
            <div className="ed-ctx-head">
              <b>{t('edit.workingOn')}</b>
              <button
                type="button"
                className="rv-undo"
                onClick={onClearComment}
              >
                {t('edit.clear')}
              </button>
            </div>
            <CommentBody c={comment} lang={lang} />
          </div>
        )}
      </div>

      <div className="ed-chat" ref={listRef}>
        {turns.length === 0 && (
          <div className="muted ed-empty">{t('edit.empty')}</div>
        )}
        {turns.map((turn, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
          <div key={i} className={`ed-msg ${turn.role}`}>
            {turn.text}
            {turn.role === 'assistant' && turn.edits && (
              <div className="ed-msg-meta">
                {turn.edits.length
                  ? t('edit.proposedCount', { count: turn.edits.length })
                  : t('edit.noEdits')}
              </div>
            )}
          </div>
        ))}
        {busy === 'chat' && (
          <div className="ed-msg assistant muted">{t('edit.reading')}</div>
        )}
      </div>

      {edits.length > 0 && (
        <div className="ed-proposals">
          <h3>{t('edit.proposed')}</h3>
          {edits.map((x) => (
            <EditCard
              key={x.idx}
              edit={x}
              included={!!on[x.idx]}
              onToggle={(v) => setOn((o) => ({ ...o, [x.idx]: v }))}
              onChange={(text) =>
                setEdits((all) =>
                  all.map((y) => (y.idx === x.idx ? { ...y, new: text } : y)),
                )
              }
            />
          ))}
          <div className="rv-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!chosen || !!busy}
              onClick={apply}
            >
              {busy === 'apply'
                ? t('edit.saving')
                : t('edit.apply', { count: chosen })}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setEdits([])}
            >
              {t('edit.discard')}
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="ed-proposals ed-pending">
          <h3>{t('edit.pendingTitle', { count: pending.length })}</h3>
          <label className="ed-pending-all">
            <input
              type="checkbox"
              checked={picked.length === pending.length}
              onChange={(e) =>
                setSel(
                  Object.fromEntries(
                    pending.map((c) => [c.id, e.target.checked]),
                  ),
                )
              }
            />{' '}
            {t('edit.selectAll')}
          </label>
          {pending.map((c) => (
            <label key={c.id} className="ed-pending-row">
              <input
                type="checkbox"
                checked={!!sel[c.id]}
                onChange={(e) =>
                  setSel((o) => ({ ...o, [c.id]: e.target.checked }))
                }
              />{' '}
              {c.instruction || t('edit.noInstruction')}{' '}
              <span className="muted">
                ({t('edit.editCount', { count: c.edit_count })})
              </span>
            </label>
          ))}
          <div className="rv-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!picked.length}
              onClick={() => setPropIds(picked)}
            >
              {t('edit.propagateSel', { count: picked.length })}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!picked.length}
              onClick={skipPicked}
            >
              {t('edit.skipPropagation')}
            </button>
          </div>
        </div>
      )}
      {propIds && (
        <PropagateDialog
          changeIds={propIds}
          onClose={() => {
            setPropIds(null);
            loadPending();
          }}
        />
      )}

      {error && <div className="rv-err ed-err">{error}</div>}
      <form className="ed-input" onSubmit={send}>
        <textarea
          rows={2}
          placeholder={t('edit.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className="btn primary"
          disabled={!input.trim() || !!busy}
        >
          {t('edit.send')}
        </button>
      </form>
    </aside>
  );
}
