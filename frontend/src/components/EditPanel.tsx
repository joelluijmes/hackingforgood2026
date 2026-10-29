import { useEffect, useRef, useState } from 'react';
import {
  type ApplyResult,
  api,
  type ChatMessage,
  type EditProposal,
  type IcfType,
  type Lang,
  type ReviewComment,
} from '../api';
import { CommentBody } from './CommentPanel';
import { errMsg } from './Dialog';
import EditCard from './EditCard';

const AUDIENCE: Record<IcfType, string> = {
  adult: 'Adult (18+)',
  parent: 'Parents',
  adolescent: 'Adolescent 12–17',
  child: 'Child 8–11',
};

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
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'chat' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<EditProposal[]>([]);
  const [on, setOn] = useState<Record<number, boolean>>({});
  const [instruction, setInstruction] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (comment) setInput('Address this Ethics Committee comment.');
  }, [comment]);

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
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy('chat');
    setError('');
    try {
      const r = await api.chat(vid, {
        message,
        history,
        comment_id: comment?.id,
      });
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: r.reply || 'Here is my proposal.',
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
    <aside className="rv-panel ed-panel" aria-label="Edit with AI">
      <div className="rv-panel-head">
        <h2>Edit with AI</h2>
        <div className="chips">
          {icfType && <span className="chip">{AUDIENCE[icfType]}</span>}
          {language && (
            <span className="chip lang">{language.toUpperCase()}</span>
          )}
        </div>
        <p className="muted ed-hint">
          Describe a change. Edits are saved as Word tracked changes in a new
          version, and can then be carried over to the other forms.
        </p>
        {comment && (
          <div className="ed-ctx">
            <div className="ed-ctx-head">
              <b>Working on comment</b>
              <button
                type="button"
                className="rv-undo"
                onClick={onClearComment}
              >
                Clear
              </button>
            </div>
            <CommentBody c={comment} lang={lang} />
          </div>
        )}
      </div>

      <div className="ed-chat" ref={listRef}>
        {turns.length === 0 && (
          <div className="muted ed-empty">
            Try: “Explain HSCT in plain words where it is first used” or pick a
            comment and click “Fix with AI”.
          </div>
        )}
        {turns.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
          <div key={i} className={`ed-msg ${t.role}`}>
            {t.text}
            {t.role === 'assistant' && t.edits && (
              <div className="ed-msg-meta">
                {t.edits.length
                  ? `${t.edits.length} proposed edit${t.edits.length > 1 ? 's' : ''}`
                  : 'No edits proposed'}
              </div>
            )}
          </div>
        ))}
        {busy === 'chat' && (
          <div className="ed-msg assistant muted">Reading the form…</div>
        )}
      </div>

      {edits.length > 0 && (
        <div className="ed-proposals">
          <h3>Proposed edits</h3>
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
                ? 'Saving…'
                : `Apply ${chosen} edit${chosen === 1 ? '' : 's'} as tracked changes`}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setEdits([])}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && <div className="rv-err ed-err">{error}</div>}
      <form className="ed-input" onSubmit={send}>
        <textarea
          rows={2}
          placeholder="Ask for a change…"
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
          Send
        </button>
      </form>
    </aside>
  );
}
