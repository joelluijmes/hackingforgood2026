import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditProposal } from '../api';

type Op = { op: 'eq' | 'ins' | 'del'; text: string };

/** Word-level diff (LCS) for showing a proposed paragraph rewrite. */
export function wordDiff(a: string, b: string): Op[] {
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] =
        x[i] === y[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Op[] = [];
  const push = (op: Op['op'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('eq', x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', x[i++]);
    else push('ins', y[j++]);
  }
  while (i < n) push('del', x[i++]);
  while (j < m) push('ins', y[j++]);
  return out;
}

export function DiffText({ old, next }: { old: string; next: string }) {
  return (
    <p className="ed-diff">
      {wordDiff(old, next).map((w, k) =>
        w.op === 'eq' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
          <span key={k}>{w.text}</span>
        ) : w.op === 'ins' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
          <ins key={k}>{w.text}</ins>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
          <del key={k}>{w.text}</del>
        ),
      )}
    </p>
  );
}

/** A proposed edit: section, mandatory-text warning, diff, include toggle, editable text. */
export default function EditCard({
  edit,
  included,
  onToggle,
  onChange,
}: {
  edit: EditProposal;
  included: boolean;
  onToggle: (v: boolean) => void;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <div className={`ed-card ${included ? '' : 'off'}`}>
      <div className="ed-card-head">
        <label>
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="ed-section">
            {edit.section || t('edit.paragraph')}
          </span>
        </label>
        <button
          type="button"
          className="rv-undo"
          onClick={() => setEditing(!editing)}
        >
          {editing ? t('edit.showChanges') : t('edit.editText')}
        </button>
      </div>
      {edit.mandatory && (
        <div className="ed-mandatory" title={edit.mandatory.template_text}>
          {t('edit.mandatory', {
            score: Math.round(edit.mandatory.score * 100),
          })}
        </div>
      )}
      {editing ? (
        <textarea
          className="ed-textarea"
          rows={Math.min(12, Math.max(3, Math.ceil(edit.new.length / 60)))}
          value={edit.new}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <DiffText old={edit.old} next={edit.new} />
      )}
      {edit.reason && <div className="rv-note">{edit.reason}</div>}
    </div>
  );
}
