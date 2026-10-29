import { useState } from 'react';
import { type Audience, api, type Language } from '../api';
import Dialog, { errMsg, FileDrop } from './Dialog';

interface Props {
  onClose: () => void;
  onDone: () => void;
}

/** Upload a national template to the library (kind fixed to template). */
export default function UploadDialog({ onClose, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [audience, setAudience] = useState<Audience | ''>('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.upload(file, {
        kind: 'template',
        name,
        language,
        audience,
        version,
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Upload template"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Upload"
      disabled={!file}
      busy={busy}
      error={error}
    >
      <FileDrop file={file} onFile={setFile} />
      <div className="grid2">
        <label>
          Name
          <input
            value={name}
            placeholder="defaults to filename"
            onChange={(e) => setName(e.target.value)}
          />
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
      </div>
    </Dialog>
  );
}
