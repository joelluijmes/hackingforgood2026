import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ApiError,
  api,
  type ProjectDoc,
  type ProjectProgress,
  type Stage,
} from '../api';
import { docStatus } from '../docStatus';
import Dialog, { errMsg } from './Dialog';
import { STAGES } from './StageStepper';

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

const reviewed = (d: ProjectDoc) =>
  d.approved || d.versions.some((v) => v.source === 'reviewed');

export default function NextStepPanel({
  projectId,
  progress,
  docs,
  onChanged,
  onUpload,
  onGenerate,
  onGenerateAll,
  onTranslateAll,
  onNewVersion,
  onError,
}: {
  projectId: number;
  progress: ProjectProgress;
  docs: ProjectDoc[];
  onChanged: () => void | Promise<void>;
  onUpload: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
  onTranslateAll: () => void;
  onNewVersion: (doc: ProjectDoc) => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const reqLabel = useReqLabel();
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = progress.stages.find((s) => s.state === 'current');
  const next = progress.next_stage;
  const stage = progress.stage;
  const prev = STAGES[STAGES.indexOf(stage) - 1] as Stage | undefined;
  const stageName = (s: Stage) => t(`stages.${s}.label`);
  if (!cur) return null;

  const firstUnmet = cur.requirements.find((r) => !r.met && r.blocking);
  const missing = cur.requirements.filter((r) => !r.met && r.blocking);
  const sponsor = docs.filter((d) => d.role === 'sponsor');
  const icfs = docs.filter((d) => d.role === 'icf');
  const en = icfs.filter((d) => d.language === 'en');
  const translated = icfs.filter(
    (d) => d.language === 'nl' || d.language === 'fr',
  );
  const latest = (d: ProjectDoc) => d.versions[0];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    onError('');
    try {
      await fn();
    } catch (e) {
      onError(errMsg(e));
    }
    await onChanged();
    setBusy(false);
  }

  async function move(to: Stage, force = false) {
    setBusy(true);
    onError('');
    try {
      await api.updateProject(projectId, { stage: to, force });
    } catch (e) {
      onError(
        e instanceof ApiError && e.status === 409
          ? t('tracker.notMet')
          : errMsg(e),
      );
    }
    setSkip(false);
    await onChanged();
    setBusy(false);
  }

  function back(to: Stage) {
    if (window.confirm(t('tracker.confirmBack', { stage: stageName(to) })))
      move(to);
  }

  // STEP: state-aware status line + primary action (first unmet requirement, else move on)
  let status: string;
  switch (stage) {
    case 'intake':
      status = sponsor.length
        ? t('next.intake.have', { count: sponsor.length })
        : t('next.intake.none');
      break;
    case 'drafting':
      status = en.length
        ? t('next.drafting.have', { count: en.length })
        : t('next.drafting.none');
      break;
    case 'pi_review':
      status = `${t('next.pi_review.status', {
        done: en.filter(reviewed).length,
        total: en.length,
      })} · ${t('next.translation.status', { count: translated.length })}`;
      break;
    case 'ethics_review':
      status = t('next.ethics_review.status', {
        done: translated.filter(reviewed).length,
        total: translated.length,
      });
      break;
    default:
      status = t('next.approved.status');
  }

  let primary: ReactNode = null;
  let docRows: ProjectDoc[] = [];
  let withApprove = false;
  if (firstUnmet) {
    switch (firstUnmet.key) {
      case 'has_sponsor_docs':
        primary = (
          <button type="button" className="btn primary" onClick={onUpload}>
            {t('next.act.upload')}
          </button>
        );
        break;
      case 'has_en_draft':
        primary = (
          <button type="button" className="btn primary" onClick={onGenerateAll}>
            {t('matrix.generateAll')}
          </button>
        );
        break;
      case 'has_reviewed_version':
        docRows = en.filter((d) => !reviewed(d));
        withApprove = true;
        break;
      case 'comments_decided': {
        const d = [...en, ...translated].find(
          (x) => !x.approved && (latest(x)?.comments_open ?? 0) > 0,
        );
        if (d)
          primary = (
            <Link className="btn primary" to={`/versions/${latest(d).id}`}>
              {t('next.act.reviewComments')}
            </Link>
          );
        break;
      }
      case 'translations_complete':
        primary = (
          <button
            type="button"
            className="btn primary"
            onClick={onTranslateAll}
          >
            {t('next.act.translate')}
          </button>
        );
        break;
      case 'ethics_reviewed': {
        docRows = translated.filter((d) => !reviewed(d));
        const withOpen = translated.find(
          (d) => !d.approved && (latest(d)?.comments_open ?? 0) > 0,
        );
        if (!docRows.length && withOpen)
          primary = (
            <Link
              className="btn primary"
              to={`/versions/${latest(withOpen).id}`}
            >
              {t('next.act.reviewComments')}
            </Link>
          );
        break;
      }
    }
  } else if (next) {
    primary = (
      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() => move(next)}
      >
        {t('tracker.moveTo', { stage: stageName(next) })}
      </button>
    );
  }

  // secondary: only what is still useful once the requirement is satisfied
  const secondary: ReactNode[] = [];
  if (!firstUnmet && stage === 'intake')
    secondary.push(
      <button key="u" type="button" className="btn" onClick={onUpload}>
        {t('next.act.addMore')}
      </button>,
    );
  if (!firstUnmet && stage === 'drafting')
    secondary.push(
      <button key="g" type="button" className="btn" onClick={onGenerate}>
        {t('next.act.generateAnother')}
      </button>,
    );

  if (stage === 'ethics_review' || stage === 'approved')
    secondary.push(
      <a
        key="zip"
        className="btn"
        href={api.projectExportUrl(projectId)}
        download
      >
        {t('next.act.openDownload')}
      </a>,
    );

  return (
    <section className="card step-card">
      <div className="sc-block">
        <div className="sc-label">{t('next.stepLabel')}</div>
        <h2 className="sc-title">
          {stageName(stage)}
          <span className="muted"> · {t(`next.${stage}.what`)}</span>
        </h2>
        <p className="sc-status">{status}</p>
        {docRows.length > 0 && (
          <table className="sc-docs">
            <tbody>
              {docRows.map((d) => {
                const v = latest(d);
                const st = docStatus(stage, {
                  source: v?.source ?? 'generated',
                  approved: d.approved,
                  language: d.language,
                });
                return (
                  <tr key={d.id}>
                    <td className="sc-doc-title">
                      {d.title}
                      {d.language && (
                        <span className="chip lang">
                          {d.language.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${st.tone}`}>
                        {t(`docStatus.${st.key}`)}
                      </span>
                    </td>
                    <td className="sc-doc-actions">
                      {v && (
                        <Link className="btn primary" to={`/versions/${v.id}`}>
                          {t('next.act.openForReview')}
                        </Link>
                      )}
                      <details className="menu">
                        <summary
                          className="btn"
                          aria-label={t('next.act.more')}
                          title={t('next.act.more')}
                        >
                          ⋯
                        </summary>
                        <div className="menu-list">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onNewVersion(d)}
                          >
                            {t('next.act.uploadReviewed')}
                          </button>
                          {withApprove && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => run(() => api.approveDoc(d.id))}
                            >
                              {t('next.act.approveAsIs')}
                            </button>
                          )}
                          {v && (
                            <a href={api.versionFileUrl(v.id)} download>
                              {t('next.act.download')}
                            </a>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {(primary || secondary.length > 0) && (
          <div className="row sc-actions">
            {primary}
            {secondary}
          </div>
        )}
      </div>

      <div className="sc-block sc-check">
        <div className="sc-label">{t('next.checklistLabel')}</div>
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
        <div className="row stage-actions">
          {next && !cur.can_leave && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setSkip(true)}
            >
              {t('tracker.skipConfirm')}
            </button>
          )}
          {prev && (
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => back(prev)}
            >
              {t('tracker.backTo', { stage: stageName(prev) })}
            </button>
          )}
        </div>
      </div>

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
    </section>
  );
}
