import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditProposal } from '../api';

/** Character with its bold/italic state (paragraph text marks them as **b**, *i*, \* = "*"). */
type Ch = { c: string; b: boolean; i: boolean };
/** A word or whitespace token with per-character formatting. */
type Tok = { text: string; chars: Ch[] };
type Op = { op: 'eq' | 'ins' | 'del' | 'fmt'; toks: Tok[] };

/** Parse the backend's formatting markers (mirror of engine/edit.py parse_marked). */
export function parseMarked(s: string): Ch[] {
  const out: Ch[] = [];
  let b = false;
  let i = false;
  let k = 0;
  while (k < s.length) {
    if (s.startsWith('\\*', k)) {
      out.push({ c: '*', b, i });
      k += 2;
      continue;
    }
    if (s[k] === '*') {
      let n = 0;
      while (s[k + n] === '*') n++;
      if (n === 3) {
        b = !b;
        i = !i;
      } else if (n === 2) b = !b;
      else if (n === 1) i = !i;
      else for (let x = 0; x < n; x++) out.push({ c: '*', b, i });
      k += n;
      continue;
    }
    out.push({ c: s[k], b, i });
    k++;
  }
  return out;
}

function tokens(chars: Ch[]): Tok[] {
  const out: Tok[] = [];
  for (const ch of chars) {
    const space = /\s/.test(ch.c);
    const last = out[out.length - 1];
    if (last && /\s/.test(last.text[0]) === space) {
      last.text += ch.c;
      last.chars.push(ch);
    } else out.push({ text: ch.c, chars: [ch] });
  }
  return out;
}

const key = (t: Tok) =>
  t.chars.map((c) => `${c.c}${c.b ? 'b' : ''}${c.i ? 'i' : ''}`).join('|');

/** Token-level diff (LCS) that also detects formatting-only changes. */
export function wordDiff(a: string, b: string): Op[] {
  const x = tokens(parseMarked(a));
  const y = tokens(parseMarked(b));
  const kx = x.map(key);
  const ky = y.map(key);
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] =
        kx[i] === ky[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw: { op: 'eq' | 'ins' | 'del'; tok: Tok }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (kx[i] === ky[j]) {
      raw.push({ op: 'eq', tok: y[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1])
      raw.push({ op: 'del', tok: x[i++] });
    else raw.push({ op: 'ins', tok: y[j++] });
  }
  while (i < n) raw.push({ op: 'del', tok: x[i++] });
  while (j < m) raw.push({ op: 'ins', tok: y[j++] });

  // group runs; a deleted run followed by an inserted run with the same words = format change
  const groups: Op[] = [];
  for (const r of raw) {
    const last = groups[groups.length - 1];
    if (last && last.op === r.op) last.toks.push(r.tok);
    else groups.push({ op: r.op, toks: [r.tok] });
  }
  const out: Op[] = [];
  const words = (o: Op) => o.toks.map((t) => t.text).join('');
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    const nx = groups[k + 1];
    if (g.op === 'del' && nx?.op === 'ins' && words(g) === words(nx)) {
      out.push({ op: 'fmt', toks: nx.toks });
      k++;
    } else out.push(g);
  }
  return out;
}

/** Render characters with their bold/italic formatting. */
function Formatted({ chars }: { chars: Ch[] }) {
  const parts: { text: string; b: boolean; i: boolean }[] = [];
  for (const ch of chars) {
    const last = parts[parts.length - 1];
    if (last && last.b === ch.b && last.i === ch.i) last.text += ch.c;
    else parts.push({ text: ch.c, b: ch.b, i: ch.i });
  }
  return (
    <>
      {parts.map((p, k) => {
        let node: React.ReactNode = p.text;
        if (p.i) node = <em>{node}</em>;
        if (p.b) node = <strong>{node}</strong>;
        // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
        return <span key={k}>{node}</span>;
      })}
    </>
  );
}

export function DiffText({ old, next }: { old: string; next: string }) {
  return (
    <p className="ed-diff">
      {wordDiff(old, next).map((w, k) => {
        const body = <Formatted chars={w.toks.flatMap((t) => t.chars)} />;
        // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
        if (w.op === 'eq') return <span key={k}>{body}</span>;
        // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
        if (w.op === 'ins') return <ins key={k}>{body}</ins>;
        // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
        if (w.op === 'del') return <del key={k}>{body}</del>;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static diff output
          <span key={k} className="ed-fmt">
            {body}
          </span>
        );
      })}
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
