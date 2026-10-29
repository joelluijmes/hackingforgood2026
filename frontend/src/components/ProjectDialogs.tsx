import { useState } from 'react';
import {
  api,
  type IcfType,
  type Language,
  type ProjectDoc,
  type Role,
} from '../api';
import Dialog, { errMsg, FileDrop } from './Dialog';

interface Common {
  onClose: () => void;
  onDone: () => void;
}

const LangOptions = () => (
  <>
    <option value="">Unknown</option>
    <option value="en">English</option>
    <option value="nl">Nederlands</option>
    <option value="fr">Français</option>
  </>
);
const IcfOptions = () => (
  <>
    <option value="">None</option>
    <option value="adult">Adult</option>
    <option value="parent">Parent</option>
    <option value="adolescent">Adolescent</option>
    <option value="child">Child</option>
  </>
);

export function UploadDocDialog({
  projectId,
  onClose,
  onDone,
}: Common & { projectId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<Role>('sponsor');
  const [icf, setIcf] = useState<IcfType | ''>('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.createProjectDoc(projectId, file, {
        title,
        role,
        icf_type: icf,
        language,
        note,
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Upload document"
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
          Title
          <input
            value={title}
            placeholder="defaults to filename"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="sponsor">Sponsor document</option>
            <option value="icf">ICF draft</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          ICF type
          <select
            value={icf}
            onChange={(e) => setIcf(e.target.value as IcfType | '')}
          >
            <IcfOptions />
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language | '')}
          >
            <LangOptions />
          </select>
        </label>
      </div>
      <label className="mt">
        Note
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Dialog>
  );
}

export function NewVersionDialog({
  doc,
  onClose,
  onDone,
}: Common & { doc: ProjectDoc }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadVersion(doc.id, file, {
        note,
        source: reviewed ? 'reviewed' : 'upload',
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`New version of ${doc.title}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Upload"
      disabled={!file}
      busy={busy}
      error={error}
    >
      <FileDrop file={file} onFile={setFile} />
      <label>
        Note
        <input
          value={note}
          placeholder="e.g. PI review round 1"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="check mt">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        This is a reviewed copy with comments
      </label>
    </Dialog>
  );
}
