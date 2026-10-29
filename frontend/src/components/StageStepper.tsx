import { useTranslation } from 'react-i18next';
import type { ProjectProgress, Stage } from '../api';

export const STAGES: Stage[] = [
  'intake',
  'drafting',
  'pi_review',
  'translation',
  'ethics_review',
  'approved',
];

/** Horizontal wizard header; completed stages are clickable to go back. */
export default function StageStepper({
  progress,
  disabled,
  onBack,
}: {
  progress: ProjectProgress;
  disabled?: boolean;
  onBack: (stage: Stage) => void;
}) {
  const { t } = useTranslation();
  return (
    <ol className="stepper" aria-label={t('stages.ariaLabel')}>
      {progress.stages.map((s, i) => {
        const inner = (
          <>
            <span className="dot">{s.state === 'done' ? '✓' : i + 1}</span>
            <span className="step-text">
              <b>{t(`stages.${s.key}.label`)}</b>
              <small>{t(`stages.${s.key}.hint`)}</small>
            </span>
          </>
        );
        return (
          <li key={s.key} className={`step ${s.state}`}>
            {s.state === 'done' ? (
              <button
                type="button"
                className="step-body clickable"
                disabled={disabled}
                onClick={() => onBack(s.key)}
                title={t('tracker.goBack')}
              >
                {inner}
              </button>
            ) : (
              <div
                className="step-body"
                aria-current={s.state === 'current' ? 'step' : undefined}
              >
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
