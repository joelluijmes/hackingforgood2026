import type { Stage } from '../api';

type Tone = 'app' | 'manual' | 'external';

export const STAGES: { key: Stage; label: string; tone: Tone; hint: string }[] =
  [
    {
      key: 'intake',
      label: 'Intake',
      tone: 'manual',
      hint: 'Collect sponsor documents',
    },
    {
      key: 'drafting',
      label: 'Drafting',
      tone: 'app',
      hint: 'Generate ICF draft',
    },
    {
      key: 'pi_review',
      label: 'PI review',
      tone: 'manual',
      hint: 'Send out, upload reviewed copy',
    },
    {
      key: 'translation',
      label: 'Translation',
      tone: 'app',
      hint: 'NL / FR versions',
    },
    {
      key: 'ethics_review',
      label: 'Ethics review',
      tone: 'external',
      hint: 'Ethics committee',
    },
    {
      key: 'approved',
      label: 'Approved',
      tone: 'external',
      hint: 'Final version',
    },
  ];

export default function StageStepper({
  stage,
  onChange,
}: {
  stage: Stage;
  onChange: (s: Stage) => void;
}) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="stages" aria-label="Project stage">
      {STAGES.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            className={`stage tone-${s.tone}${i === current ? ' current' : ''}${i < current ? ' done' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            onClick={() => onChange(s.key)}
          >
            <span className="dot">{i < current ? '✓' : i + 1}</span>
            <b>{s.label}</b>
            <small>{s.hint}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}
