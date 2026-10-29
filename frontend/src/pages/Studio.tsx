import { useEffect, useState } from 'react';
import { api, type Document, type JobResponse } from '../api';

type Mode = 'creation' | 'translation' | 'update';

const STEPS: { label: string; covered: Mode | null }[] = [
  { label: 'Receive sponsor docs', covered: null },
  { label: 'Create EN ICFs', covered: 'creation' },
  { label: 'PI review', covered: null },
  { label: 'Translate FR & NL', covered: 'translation' },
  { label: 'Ethics committee', covered: null },
];

function Stepper({ mode }: { mode: Mode }) {
  return (
    <ol className="stepper" aria-label="Desired flow">
      {STEPS.map((s, i) => (
        <li
          key={s.label}
          className={`${s.covered ? 'covered' : ''}${s.covered === mode ? ' current' : ''}`}
        >
          <span className="dot">{i + 1}</span>
          <span>{s.label}</span>
          {s.covered && <small>app covers</small>}
        </li>
      ))}
    </ol>
  );
}

function Picker({
  docs,
  selected,
  onToggle,
  empty,
}: {
  docs: Document[];
  selected: number[];
  onToggle: (id: number) => void;
  empty: string;
}) {
  if (docs.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="picker">
      {docs.map((d) => (
        <label key={d.id} className="pick">
          <input
            type="checkbox"
            checked={selected.includes(d.id)}
            onChange={() => onToggle(d.id)}
          />
          <span>
            {d.name}
            <small>
              {[d.language?.toUpperCase(), d.audience, d.study, d.version]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
        </label>
      ))}
    </div>
  );
}

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export default function Studio() {
  const [mode, setMode] = useState<Mode>('creation');
  const [templates, setTemplates] = useState<Document[]>([]);
  const [sponsors, setSponsors] = useState<Document[]>([]);
  const [result, setResult] = useState<JobResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [templateId, setTemplateId] = useState<number | ''>('');
  const [sponsorIds, setSponsorIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [sourceIds, setSourceIds] = useState<number[]>([]);
  const [targets, setTargets] = useState<('nl' | 'fr')[]>(['nl', 'fr']);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [newTemplate, setNewTemplate] = useState<number | ''>('');

  useEffect(() => {
    Promise.all([api.listDocuments('template'), api.listDocuments('sponsor')])
      .then(([t, s]) => {
        setTemplates(t);
        setSponsors(s);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setResult(null);
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError('');
    try {
      if (mode === 'creation') {
        setResult(
          await api.jobCreation({
            template_id: Number(templateId),
            sponsor_ids: sponsorIds,
            notes,
          }),
        );
      } else if (mode === 'translation') {
        setResult(
          await api.jobTranslation({
            source_ids: sourceIds,
            target_languages: targets,
          }),
        );
      } else {
        setResult(
          await api.jobUpdate({
            document_ids: docIds,
            new_template_id: Number(newTemplate),
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  const ready =
    mode === 'creation'
      ? templateId !== '' && sponsorIds.length > 0
      : mode === 'translation'
        ? sourceIds.length > 0 && targets.length > 0
        : docIds.length > 0 && newTemplate !== '';

  const templateSelect = (
    value: number | '',
    set: (v: number | '') => void,
  ) => (
    <select
      aria-label="Template"
      value={value}
      onChange={(e) => set(e.target.value ? Number(e.target.value) : '')}
    >
      <option value="">Choose a template…</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} {t.language ? `(${t.language.toUpperCase()})` : ''}{' '}
          {t.version ?? ''}
        </option>
      ))}
    </select>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Studio</h1>
          <p className="muted">
            Where ICFs get drafted, translated and refreshed. Generation is
            coming soon; the plumbing is ready.
          </p>
        </div>
      </div>

      <Stepper mode={mode} />

      <div className="tabs" role="tablist">
        {(['creation', 'translation', 'update'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? 'tab active' : 'tab'}
            onClick={() => switchMode(m)}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <form className="panel" onSubmit={submit}>
        {mode === 'creation' && (
          <>
            <h3>Create an ICF from sponsor documents</h3>
            <div className="field">
              <span>National template</span>
              {templateSelect(templateId, setTemplateId)}
            </div>
            <fieldset>
              <legend>Sponsor documents</legend>
              <Picker
                docs={sponsors}
                selected={sponsorIds}
                onToggle={(id) => setSponsorIds((l) => toggle(l, id))}
                empty="No sponsor documents yet. Add some in the Library."
              />
            </fieldset>
            <label>
              Additional information
              <textarea
                rows={4}
                value={notes}
                placeholder="Site specifics, deviations, anything the drafter should know…"
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </>
        )}
        {mode === 'translation' && (
          <>
            <h3>Translate approved English ICFs</h3>
            <fieldset>
              <legend>Source ICFs</legend>
              <Picker
                docs={sponsors}
                selected={sourceIds}
                onToggle={(id) => setSourceIds((l) => toggle(l, id))}
                empty="No documents yet. Add some in the Library."
              />
            </fieldset>
            <fieldset className="inline">
              <legend>Target languages</legend>
              {(['nl', 'fr'] as const).map((l) => (
                <label key={l} className="check">
                  <input
                    type="checkbox"
                    checked={targets.includes(l)}
                    onChange={() =>
                      setTargets((t) =>
                        t.includes(l) ? t.filter((x) => x !== l) : [...t, l],
                      )
                    }
                  />
                  {l === 'nl' ? 'Nederlands' : 'Français'}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {mode === 'update' && (
          <>
            <h3>Move existing ICFs to a new template version</h3>
            <fieldset>
              <legend>Documents to update</legend>
              <Picker
                docs={sponsors}
                selected={docIds}
                onToggle={(id) => setDocIds((l) => toggle(l, id))}
                empty="No documents yet. Add some in the Library."
              />
            </fieldset>
            <div className="field">
              <span>New template version</span>
              {templateSelect(newTemplate, setNewTemplate)}
            </div>
          </>
        )}
        <div className="actions">
          <button
            type="submit"
            className="btn primary"
            disabled={!ready || busy}
          >
            {busy ? 'Submitting…' : `Run ${mode}`}
          </button>
        </div>
      </form>

      {result && (
        <div className="status soon" role="status">
          <strong>Coming soon</strong>
          <p>{result.message}</p>
          <small>
            {result.mode} · {result.status}
          </small>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
