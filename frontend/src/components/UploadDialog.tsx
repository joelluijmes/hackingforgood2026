import { useEffect, useRef, useState } from 'react';
import { type Audience, api, type Kind, type Language } from '../api';

interface Props {
  kind: Kind;
  onClose: () => void;
  onDone: () => void;
}

export default function UploadDialog({ kind, onClose, onDone }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [k, setK] = useState<Kind>(kind);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [audience, setAudience] = useState<Audience | ''>('');
  const [version, setVersion] = useState('');
  const [study, setStudy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.upload(file, {
        kind: k,
        name,
        language,
        audience,
        version,
        study,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Upload document</h2>
        <label
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <strong>{file.name}</strong>
          ) : (
            <span>
              <strong>Drop a file here</strong> or click to browse
              <br />
              <small>.docx previews best; PDFs also supported</small>
            </span>
          )}
        </label>
        <div className="grid2">
          <label>
            Kind
            <select value={k} onChange={(e) => setK(e.target.value as Kind)}>
              <option value="sponsor">Sponsor document</option>
              <option value="template">Template</option>
            </select>
          </label>
          <label>
            Name
            <input
              value={name}
              placeholder="defaults to filename"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language | '')}
            >
              <option value="">Unknown</option>
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label>
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience | '')}
            >
              <option value="">Unknown</option>
              <option value="adult">Adult</option>
              <option value="parent">Parent</option>
              <option value="adolescent">Adolescent</option>
              <option value="child">Child</option>
            </select>
          </label>
          <label>
            Version
            <input
              value={version}
              placeholder="e.g. 2025-07-18"
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
          <label>
            Study
            <input
              value={study}
              placeholder="e.g. Forum"
              onChange={(e) => setStudy(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={!file || busy}
          >
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
