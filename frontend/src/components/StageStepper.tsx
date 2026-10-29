import { useTranslation } from 'react-i18next';
import type { Stage } from '../api';

type Tone = 'app' | 'manual' | 'external';

export const STAGES: { key: Stage; tone: Tone }[] = [
  { key: 'intake', tone: 'manual' },
  { key: 'drafting', tone: 'app' },
  { key: 'pi_review', tone: 'manual' },
  { key: 'translation', tone: 'app' },
  { key: 'ethics_review', tone: 'external' },
  { key: 'approved', tone: 'external' },
];

export default function StageStepper({
  stage,
  onChange,
}: {
  stage: Stage;
  onChange: (s: Stage) => void;
}) {
  const { t } = useTranslation();
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="stages" aria-label={t('stages.ariaLabel')}>
      {STAGES.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            className={`stage tone-${s.tone}${i === current ? ' current' : ''}${i < current ? ' done' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            onClick={() => onChange(s.key)}
          >
            <span className="dot">{i < current ? '✓' : i + 1}</span>
            <b>{t(`stages.${s.key}.label`)}</b>
            <small>{t(`stages.${s.key}.hint`)}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}
