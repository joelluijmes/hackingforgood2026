import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type Document,
  type GenerateReport,
  type IcfType,
  type Language,
  type ProjectDoc,
} from '../api';
import Dialog, { errMsg } from './Dialog';

interface Props {
  projectId: number;
  docs: ProjectDoc[];
  onClose: () => void;
  onDone: () => void;
}

export default function GenerateDialog({
  projectId,
  docs,
  onClose,
  onDone,
}: Props) {
  const sponsors = docs.filter((d) => d.role === 'sponsor' && d.versions[0]);
  const [templates, setTemplates] = useState<Document[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [icf, setIcf] = useState<IcfType>('adult');
  const [language, setLanguage] = useState<Language>('en');
  const [picked, setPicked] = useState<Set<number>>(
    new Set(sponsors.map((d) => d.versions[0].id)),
  );
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    doc: ProjectDoc;
    report: GenerateReport;
  } | null>(null);

  useEffect(() => {
    api
      .listDocuments('template')
      .then((t) => {
        setTemplates(t);
        if (t[0]) setTemplateId(String(t[0].id));
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates?.find((x) => String(x.id) === id);
    if (t?.audience) setIcf(t.audience);
    if (t?.language) setLanguage(t.language);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.generate(projectId, {
        template_id: Number(templateId),
        icf_type: icf,
        language,
        sponsor_version_ids: [...picked],
        notes,
        title: title || undefined,
      });
      setResult(r);
      onDone();
    } catch (err) {
      setError(errMsg(err));
    }
    setBusy(false);
  }

  if (result) {
    const r = result.report;
    return (
      <Dialog
        title="Draft generated"
        onClose={onClose}
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
        submitLabel="Close"
      >
        <dl className="report">
          <dt>Placeholders</dt>
          <dd>{r.placeholders_total}</dd>
          <dt>Filled</dt>
          <dd>{r.filled}</dd>
          <dt>Flagged with a comment</dt>
          <dd>{r.flagged}</dd>
          <dt>Guidance paragraphs removed</dt>
          <dd>{r.removed_guidance_paragraphs}</dd>
          <dt>AI used</dt>
          <dd>{r.ai_used ? 'Yes' : 'No'}</dd>
        </dl>
        {result.doc.versions[0] && (
          <Link
            className="btn primary"
            to={`/versions/${result.doc.versions[0].id}`}
          >
            Open the new draft
          </Link>
        )}
      </Dialog>
    );
  }

  if (busy) {
    return (
      <Dialog
        title="Generate ICF draft"
        onClose={() => {}}
        onSubmit={(e) => e.preventDefault()}
        submitLabel="Generate"
        busy
      >
        <div className="spinner-row">
          <span className="spinner" aria-hidden="true" />
          Generating from template... this can take a minute
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Generate ICF draft"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Generate"
      disabled={!templateId}
      error={error}
      wide
    >
      <div className="stack">
        <label>
          Template
          <select
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
          >
            {templates === null && <option>Loading…</option>}
            {templates?.length === 0 && <option>No templates yet</option>}
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language?.toUpperCase() ?? '?'}
                {t.version ? `, v ${t.version}` : ''}
                {t.audience ? `, ${t.audience}` : ''})
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label>
            ICF type
            <select
              value={icf}
              onChange={(e) => setIcf(e.target.value as IcfType)}
            >
              <option value="adult">Adult</option>
              <option value="parent">Parent</option>
              <option value="adolescent">Adolescent</option>
              <option value="child">Child</option>
            </select>
          </label>
          <label>
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
              <option value="fr">Français</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Sponsor documents (latest version)</legend>
          {sponsors.length === 0 && (
            <p className="muted">No sponsor documents in this project.</p>
          )}
          {sponsors.map((d) => {
            const v = d.versions[0];
            return (
              <label key={d.id} className="check">
                <input
                  type="checkbox"
                  checked={picked.has(v.id)}
                  onChange={(e) => {
                    const s = new Set(picked);
                    if (e.target.checked) s.add(v.id);
                    else s.delete(v.id);
                    setPicked(s);
                  }}
                />
                {d.title} (v{v.number})
              </label>
            );
          })}
        </fieldset>
        <label>
          Notes
          <textarea
            rows={3}
            value={notes}
            placeholder="Anything the draft should take into account"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label>
          Title (optional)
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
