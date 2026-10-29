import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  api,
  type EditProposal,
  type PropagationResult,
  type PropagationTarget,
} from '../api';
import Dialog, { errMsg } from './Dialog';
import EditCard from './EditCard';

/** Carry an applied change over to the project's other ICFs (audiences × languages). */
export default function PropagateDialog({
  changeId,
  onClose,
}: {
  changeId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<PropagationTarget[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<PropagationResult[] | null>(null);

  useEffect(() => {
    let live = true;
    api.propagatePreview(changeId).then(
      (list) => {
        if (!live) return;
        setTargets(list);
        const init: Record<string, boolean> = {};
        for (const x of list)
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
      (all ?? []).map((x) =>
        x.version_id !== vid
          ? x
          : {
              ...x,
              edits: x.edits.map((e) =>
                e.idx === idx ? { ...e, new: text } : e,
              ),
            },
      ),
    );

  const chosen = (x: PropagationTarget): EditProposal[] =>
    x.edits.filter((e) => on[`${x.version_id}:${e.idx}`]);
  const forms = (targets ?? []).filter((x) => chosen(x).length).length;

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
            .map((x) => ({ version_id: x.version_id, edits: chosen(x) }))
            .filter((x) => x.edits.length),
        ),
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const titleOf = (vid: number) =>
    targets?.find((x) => x.version_id === vid)?.doc.title ?? `#${vid}`;

  return (
    <Dialog
      title={t('propagate.title')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={
        results ? t('propagate.done') : t('propagate.apply', { count: forms })
      }
      disabled={!results && (!targets || !forms)}
      busy={busy}
      error={error}
      wide
    >
      {!targets && !error && <p className="muted">{t('propagate.loading')}</p>}
      {results && (
        <ul className="pg-results">
          {results.map((r) => (
            <li key={r.version_id}>
              <b>{titleOf(r.version_id)}</b>{' '}
              {r.version ? (
                <Link to={`/versions/${r.version.id}`} onClick={onClose}>
                  {t('propagate.created', { number: r.version.number })}
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
          {targets.map((x) => (
            <section key={x.version_id} className={`pg-target ${x.status}`}>
              <div className="pg-head">
                <b>{x.doc.title}</b>
                <span className="muted">v{x.version_number}</span>
                <span
                  className={`chip ${x.status === 'proposed' ? 'ok' : x.status === 'error' ? 'bad' : ''}`}
                >
                  {t(`propagate.status.${x.status}`)}
                </span>
              </div>
              {x.reason && <div className="rv-note">{x.reason}</div>}
              {x.edits.map((e) => (
                <EditCard
                  key={e.idx}
                  edit={e}
                  included={!!on[`${x.version_id}:${e.idx}`]}
                  onToggle={(v) =>
                    setOn((o) => ({ ...o, [`${x.version_id}:${e.idx}`]: v }))
                  }
                  onChange={(text) => setEdit(x.version_id, e.idx, text)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
