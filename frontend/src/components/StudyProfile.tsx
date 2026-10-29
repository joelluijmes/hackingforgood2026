import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type FactDef,
  type FactSuggestion,
  type ProjectFacts,
} from '../api';
import Dialog, { errMsg } from './Dialog';

const GROUPS = [
  'study',
  'site',
  'contacts',
  'privacy',
  'ethics',
  'insurance',
] as const;
const INPUT_TYPE = {
  text: 'text',
  phone: 'tel',
  email: 'email',
  multiline: 'text',
} as const;

type Block = { title: string; fields: FactDef[] };

/** Split a group's facts into blocks by label prefix ("Contact: phone" -> title "Contact"). */
function toBlocks(defs: FactDef[]): Block[] {
  const out: Block[] = [];
  for (const f of defs) {
    const title = f.label.includes(': ') ? f.label.split(': ')[0] : '';
    const last = out[out.length - 1];
    if (last && last.title === title) last.fields.push(f);
    else out.push({ title, fields: [f] });
  }
  return out;
}
const shortLabel = (l: string) => (l.includes(': ') ? l.split(': ')[1] : l);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Grouped fact fields as cards. `values` = own values (overrides), `inherited` = inherited values. */
export function FactFields({
  schema,
  values,
  inherited,
  onChange,
  sources,
  groups,
}: {
  schema: FactDef[];
  values: Record<string, string>;
  inherited?: Record<string, string>;
  sources?: Record<string, string>;
  groups?: readonly string[];
  onChange: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const field = (f: FactDef) => {
    const own = values[f.key] ?? '';
    const inh = inherited?.[f.key] ?? '';
    const src = sources?.[f.key];
    const state = own ? 'f-filled' : inh ? 'f-inh' : 'f-empty';
    return (
      <div
        key={f.key}
        className={`facts-field ${state}${f.kind === 'multiline' ? ' wide' : ''}`}
      >
        <span className="facts-label">
          <label htmlFor={`fact-${f.key}`}>{cap(shortLabel(f.label))}</label>
          {src === 'inferred' && own && (
            <span className="chip st-neutral">{t('facts.src_inferred')}</span>
          )}
          {inh && !own && (
            <span className="chip" title={t('facts.inherited')}>
              {t('facts.src_global')}
            </span>
          )}
          {inh && own && (
            <button
              type="button"
              className="link-btn"
              onClick={() => onChange(f.key, '')}
            >
              {t('facts.revert')}
            </button>
          )}
        </span>
        {f.kind === 'multiline' ? (
          <textarea
            id={`fact-${f.key}`}
            rows={2}
            value={own}
            placeholder={inh}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        ) : (
          <input
            id={`fact-${f.key}`}
            type={INPUT_TYPE[f.kind]}
            value={own}
            placeholder={inh}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        )}
        {f.hint && <small className="facts-hint">{f.hint}</small>}
      </div>
    );
  };
  return (
    <div className="facts-cards">
      {(groups ?? GROUPS).map((g) => {
        const defs = schema.filter((f) => f.group === g);
        if (!defs.length) return null;
        const filled = defs.filter(
          (f) => (values[f.key] ?? '').trim() || inherited?.[f.key],
        ).length;
        return (
          <section key={g} className="facts-card">
            <header>
              <h3>{t(`facts.group.${g}`)}</h3>
              <span className="muted">
                {filled}/{defs.length}
              </span>
            </header>
            {toBlocks(defs).map((b) => (
              <div key={b.fields[0].key} className="facts-block">
                {b.title && <h4>{cap(b.title)}</h4>}
                <div className="facts-grid">{b.fields.map(field)}</div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function ReviewDialog({
  pid,
  schema,
  suggestions,
  onClose,
  onSaved,
}: {
  pid: number;
  schema: FactDef[];
  suggestions: FactSuggestion[];
  onClose: () => void;
  onSaved: (f: ProjectFacts) => void;
}) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState<Set<string>>(
    new Set(suggestions.map((s) => s.key)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = (k: string) => schema.find((f) => f.key === k)?.label ?? k;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const values = Object.fromEntries(
        suggestions
          .filter((s) => accepted.has(s.key))
          .map((s) => [s.key, s.value]),
      );
      onSaved(await api.putProjectFacts(pid, values, 'inferred'));
      onClose();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={t('facts.reviewTitle')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('facts.acceptSelected', { n: accepted.size })}
      disabled={accepted.size === 0}
      busy={busy}
      error={error}
      wide
    >
      {suggestions.length === 0 ? (
        <p className="muted">{t('facts.none')}</p>
      ) : (
        <>
          <p className="muted">{t('facts.reviewHint')}</p>
          <ul className="facts-suggest">
            {suggestions.map((s) => (
              <li key={s.key}>
                <label className="facts-suggest-row">
                  <input
                    type="checkbox"
                    checked={accepted.has(s.key)}
                    onChange={(e) =>
                      setAccepted((a) => {
                        const n = new Set(a);
                        if (e.target.checked) n.add(s.key);
                        else n.delete(s.key);
                        return n;
                      })
                    }
                  />
                  <span>
                    <b>{label(s.key)}</b>
                    <span className="facts-suggest-value">{s.value}</span>
                    {s.current && (
                      <small className="muted">
                        {t('facts.current')}: {s.current}
                      </small>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

/** Slim summary row: completeness + Edit button (the dialog lives on the project page). */
export default function StudyProfile({
  projectId,
  version,
  onEdit,
}: {
  projectId: number;
  version: number;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProjectFacts | null>(null);
  useEffect(() => {
    void version;
    api.getProjectFacts(projectId).then(setData, () => setData(null));
  }, [projectId, version]);
  if (!data) return null;
  return (
    <div className="study-profile-row">
      <strong>{t('facts.title')}</strong>
      <span className="facts-meter" aria-hidden="true">
        <span
          style={{ width: `${(100 * data.filled) / Math.max(1, data.total)}%` }}
        />
      </span>
      <span className="muted">
        {t('facts.filled', { filled: data.filled, total: data.total })}
      </span>
      <button type="button" className="btn" onClick={onEdit}>
        {t('facts.edit')}
      </button>
    </div>
  );
}
