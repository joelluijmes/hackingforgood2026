import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type EditProposal,
  type PropagationResult,
  type PropagationTarget,
} from '../api';
import Dialog, { errMsg } from './Dialog';
import EditCard from './EditCard';

const STATUS: Record<PropagationTarget['status'], string> = {
  proposed: 'Change proposed',
  not_applicable: 'Not applicable',
  error: 'Failed',
};

/** Carry an applied change over to the project's other ICFs (audiences × languages). */
export default function PropagateDialog({
  changeId,
  onClose,
}: {
  changeId: number;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<PropagationTarget[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<PropagationResult[] | null>(null);

  useEffect(() => {
    let live = true;
    api.propagatePreview(changeId).then(
      (t) => {
        if (!live) return;
        setTargets(t);
        const init: Record<string, boolean> = {};
        for (const x of t)
          for (const e of x.edits) init[`${x.version_id}:${e.idx}`] = true;
        setOn(init);
      },
      (e) => live && setError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [changeId]);

  const setEdit = (vid: number, idx: number, text: string) =>
    setTargets((all) =>
      (all ?? []).map((t) =>
        t.version_id !== vid
          ? t
          : {
              ...t,
              edits: t.edits.map((e) =>
                e.idx === idx ? { ...e, new: text } : e,
              ),
            },
      ),
    );

  const chosen = (t: PropagationTarget): EditProposal[] =>
    t.edits.filter((e) => on[`${t.version_id}:${e.idx}`]);
  const forms = (targets ?? []).filter((t) => chosen(t).length).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (results) return onClose();
    if (!targets) return;
    setBusy(true);
    setError('');
    try {
      setResults(
        await api.propagateApply(
          changeId,
          targets
            .map((t) => ({ version_id: t.version_id, edits: chosen(t) }))
            .filter((t) => t.edits.length),
        ),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const titleOf = (vid: number) =>
    targets?.find((t) => t.version_id === vid)?.doc.title ?? `#${vid}`;

  return (
    <Dialog
      title="Apply this change to the other forms"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={
        results ? 'Done' : `Apply to ${forms} form${forms === 1 ? '' : 's'}`
      }
      disabled={!results && (!targets || !forms)}
      busy={busy}
      error={error}
      wide
    >
      {!targets && !error && (
        <p className="muted">
          Asking Vertex AI to adapt the change for each audience and language…
          this takes about half a minute.
        </p>
      )}
      {results && (
        <ul className="pg-results">
          {results.map((r) => (
            <li key={r.version_id}>
              <b>{titleOf(r.version_id)}</b>{' '}
              {r.version ? (
                <Link to={`/versions/${r.version.id}`} onClick={onClose}>
                  v{r.version.number} created
                </Link>
              ) : (
                <span className="rv-err">{r.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {targets && !results && (
        <div className="pg-list">
          {targets.map((t) => (
            <section key={t.version_id} className={`pg-target ${t.status}`}>
              <div className="pg-head">
                <b>{t.doc.title}</b>
                <span className="muted">v{t.version_number}</span>
                <span
                  className={`chip ${t.status === 'proposed' ? 'ok' : t.status === 'error' ? 'bad' : ''}`}
                >
                  {STATUS[t.status]}
                </span>
              </div>
              {t.reason && <div className="rv-note">{t.reason}</div>}
              {t.edits.map((e) => (
                <EditCard
                  key={e.idx}
                  edit={e}
                  included={!!on[`${t.version_id}:${e.idx}`]}
                  onToggle={(v) =>
                    setOn((o) => ({ ...o, [`${t.version_id}:${e.idx}`]: v }))
                  }
                  onChange={(text) => setEdit(t.version_id, e.idx, text)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
