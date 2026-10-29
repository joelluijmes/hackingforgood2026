import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api, type ProjectProgress, type Stage } from '../api';
import Dialog, { errMsg } from './Dialog';

export const STAGES: Stage[] = [
  'intake',
  'drafting',
  'pi_review',
  'translation',
  'ethics_review',
  'approved',
];

/** Requirement key -> translated label (details become counts / lists). */
function useReqLabel() {
  const { t } = useTranslation();
  const tIcf = (a: string) => t(`icfTypes.${a.trim()}`, a.trim());
  return (key: string, detail: string | null) => {
    const d = detail ?? '';
    switch (key) {
      case 'draft_types_missing':
        return t('req.draft_types_missing', {
          list: d.split(',').filter(Boolean).map(tIcf).join(', '),
        });
      case 'comments_decided':
        return t('req.comments_decided', { count: Number(d) || 0 });
      case 'translations_complete':
        return t('req.translations_complete', {
          list: d
            .split(',')
            .filter(Boolean)
            .map((x) => {
              const [a, l] = x.trim().split(':');
              return l ? `${tIcf(a)} ${l.toUpperCase()}` : tIcf(a);
            })
            .join(', '),
        });
      default:
        return t(`req.${key}`, { defaultValue: key });
    }
  };
}

export default function StageTracker({
  projectId,
  progress,
  onChanged,
}: {
  projectId: number;
  progress: ProjectProgress;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const reqLabel = useReqLabel();
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idx = (s: Stage) => STAGES.indexOf(s);
  const cur = progress.stages.find((s) => s.state === 'current');
  const next = progress.next_stage;
  const prev = STAGES[idx(progress.stage) - 1] as Stage | undefined;
  const missing = (cur?.requirements ?? []).filter((r) => !r.met && r.blocking);
  const stageName = (s: Stage) => t(`stages.${s}.label`);

  async function move(stage: Stage, force = false) {
    setBusy(true);
    setError('');
    try {
      await api.updateProject(projectId, { stage, force });
    } catch (e) {
      // 409: gates changed under us; refresh and the missing list shows again
      if (!(e instanceof ApiError && e.status === 409)) setError(errMsg(e));
      else setError(t('tracker.notMet'));
    }
    setSkip(false);
    await onChanged();
    setBusy(false);
  }

  function back(stage: Stage) {
    if (window.confirm(t('tracker.confirmBack', { stage: stageName(stage) })))
      move(stage);
  }

  return (
    <div className="tracker">
      <ol className="stages" aria-label={t('stages.ariaLabel')}>
        {progress.stages.map((s, i) => {
          const inner = (
            <>
              <span className="dot">{s.state === 'done' ? '✓' : i + 1}</span>
              <b>{stageName(s.key)}</b>
              <small>{t(`stages.${s.key}.hint`)}</small>
            </>
          );
          const cls = `stage ${s.state}`;
          return (
            <li key={s.key}>
              {s.state === 'done' ? (
                <button
                  type="button"
                  className={`${cls} clickable`}
                  disabled={busy}
                  onClick={() => back(s.key)}
                  title={t('tracker.goBack')}
                >
                  {inner}
                </button>
              ) : (
                <div
                  className={cls}
                  aria-current={s.state === 'current' ? 'step' : undefined}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {cur && (
        <section className="stage-panel">
          <h3>
            {next
              ? t('tracker.toMoveOn', { stage: stageName(cur.key) })
              : t('tracker.finalTitle')}
          </h3>
          {cur.requirements.length === 0 ? (
            <p className="muted">{t('tracker.nothingRequired')}</p>
          ) : (
            <ul className="reqs">
              {cur.requirements.map((r) => {
                const kind = r.met ? 'met' : r.blocking ? 'miss' : 'hint';
                return (
                  <li key={r.key} className={`req ${kind}`}>
                    <span className="req-ico" aria-hidden="true">
                      {r.met ? '✓' : r.blocking ? '✗' : 'i'}
                    </span>
                    <span>{reqLabel(r.key, r.detail)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
          <div className="row stage-actions">
            {next && (
              <button
                type="button"
                className="btn primary"
                disabled={busy || !cur.can_leave}
                onClick={() => move(next)}
              >
                {t('tracker.moveTo', { stage: stageName(next) })}
              </button>
            )}
            {next && !cur.can_leave && (
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => setSkip(true)}
              >
                {t('tracker.skip')}
              </button>
            )}
            {prev && (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => back(prev)}
              >
                {t('tracker.backTo', { stage: stageName(prev) })}
              </button>
            )}
          </div>
        </section>
      )}

      {skip && next && (
        <Dialog
          title={t('tracker.skipTitle', { stage: stageName(next) })}
          onClose={() => setSkip(false)}
          onSubmit={(e) => {
            e.preventDefault();
            move(next, true);
          }}
          submitLabel={t('tracker.skipConfirm')}
          busy={busy}
        >
          <p>{t('tracker.skipText')}</p>
          <ul className="reqs">
            {missing.map((r) => (
              <li key={r.key} className="req miss">
                <span className="req-ico" aria-hidden="true">
                  ✗
                </span>
                <span>{reqLabel(r.key, r.detail)}</span>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
