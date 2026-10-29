import { useCallback, useEffect, useState } from 'react';
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

/** Grouped fact fields. `values` = own values (overrides), `inherited` = placeholder values. */
export function FactFields({
  schema,
  values,
  inherited,
  onChange,
  sources,
}: {
  schema: FactDef[];
  values: Record<string, string>;
  inherited?: Record<string, string>;
  sources?: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {GROUPS.map((g) => {
        const defs = schema.filter((f) => f.group === g);
        if (!defs.length) return null;
        return (
          <fieldset key={g} className="facts-group">
            <legend>{t(`facts.group.${g}`)}</legend>
            <div className="facts-grid">
              {defs.map((f) => {
                const own = values[f.key] ?? '';
                const inh = inherited?.[f.key] ?? '';
                const src = sources?.[f.key];
                return (
                  <div
                    key={f.key}
                    className={`facts-field${f.kind === 'multiline' ? ' wide' : ''}`}
                  >
                    <span className="facts-label">
                      <label htmlFor={`fact-${f.key}`}>{f.label}</label>
                      {src === 'inferred' && own && (
                        <span className="chip st-neutral">
                          {t('facts.src_inferred')}
                        </span>
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
                        placeholder={inh || f.hint}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={`fact-${f.key}`}
                        type={INPUT_TYPE[f.kind]}
                        value={own}
                        placeholder={inh || f.hint}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

function ReviewDialog({
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

export default function StudyProfile({
  projectId,
  hasSponsorDocs,
  onProjectChanged,
}: {
  projectId: number;
  hasSponsorDocs: boolean;
  onProjectChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProjectFacts | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'infer' | ''>('');
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<FactSuggestion[] | null>(null);

  const apply = useCallback((f: ProjectFacts) => {
    setData(f);
    setDraft(
      Object.fromEntries(
        Object.entries(f.facts).map(([k, v]) => [
          k,
          v.source === 'global' ? '' : v.value,
        ]),
      ),
    );
  }, []);
  useEffect(() => {
    api.getProjectFacts(projectId).then(apply, (e) => setError(errMsg(e)));
  }, [projectId, apply]);

  if (!data) return error ? <p className="error">{error}</p> : null;
  const schema = data.schema.filter((f) => f.scope !== 'global');
  const inherited = data.globals;
  const sources = Object.fromEntries(
    Object.entries(data.facts).map(([k, v]) => [k, v.source]),
  );
  const changed = Object.entries(draft).filter(([k, v]) => {
    const cur = data.facts[k];
    return v.trim() !== (cur.source === 'global' ? '' : cur.value);
  });

  async function save() {
    setBusy('save');
    setError('');
    try {
      apply(await api.putProjectFacts(projectId, Object.fromEntries(changed)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy('');
  }
  async function infer() {
    setBusy('infer');
    setError('');
    try {
      setSuggestions((await api.inferProjectFacts(projectId)).suggestions);
    } catch (e) {
      const m = errMsg(e);
      setError(
        m.includes('no_sponsor')
          ? t('facts.noSponsor')
          : m.includes('ai_unavailable')
            ? t('facts.aiOff')
            : m.includes('ai_failed')
              ? t('facts.aiFail')
              : m,
      );
    }
    setBusy('');
  }

  return (
    <details className="group section study-profile">
      <summary>
        <span className="chev" aria-hidden="true" />
        <h2>{t('facts.title')}</h2>
        <span className="chip">
          {t('facts.filled', { filled: data.filled, total: data.total })}
        </span>
      </summary>
      <div className="stack">
        <div className="facts-meter" aria-hidden="true">
          <span
            style={{
              width: `${(100 * data.filled) / Math.max(1, data.total)}%`,
            }}
          />
        </div>
        <p className="muted">{t('facts.hint')}</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={busy !== '' || !hasSponsorDocs}
            title={hasSponsorDocs ? undefined : t('facts.noSponsor')}
            onClick={infer}
          >
            {busy === 'infer' ? t('facts.inferring') : t('facts.infer')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy !== '' || changed.length === 0}
            onClick={save}
          >
            {saved ? t('facts.saved') : t('facts.save')}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <FactFields
          schema={schema}
          values={draft}
          inherited={inherited}
          sources={sources}
          onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
        />
      </div>
      {suggestions && (
        <ReviewDialog
          pid={projectId}
          schema={data.schema}
          suggestions={suggestions}
          onClose={() => setSuggestions(null)}
          onSaved={(f) => {
            apply(f);
            onProjectChanged?.();
          }}
        />
      )}
    </details>
  );
}
