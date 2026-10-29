import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type IcfType,
  type Language,
  type ProjectDoc,
  type Role,
} from '../api';
import Dialog, { errMsg, FileDrop } from './Dialog';
import { IcfOptions, LangOptions } from './Options';

interface Common {
  onClose: () => void;
  onDone: () => void;
}

export function UploadDocDialog({
  projectId,
  onClose,
  onDone,
}: Common & { projectId: number }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [role, setRole] = useState<Role>('sponsor');
  const [icf, setIcf] = useState<IcfType | ''>('adult');
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
        icf_type: role === 'icf' ? icf || 'adult' : icf,
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
      title={t('project.uploadTitle')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('common.upload')}
      disabled={!file}
      busy={busy}
      error={error}
    >
      <FileDrop file={file} onFile={setFile} />
      <div className="grid2">
        <label>
          {t('common.title')}
          <input
            value={title}
            placeholder={t('common.defaultsToFilename')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {t('project.role')}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="sponsor">{t('roles.sponsor')}</option>
            <option value="icf">{t('roles.icf')}</option>
            <option value="other">{t('roles.other')}</option>
          </select>
        </label>
        <label>
          {t('project.icfType')}
          <select
            value={icf}
            onChange={(e) => setIcf(e.target.value as IcfType | '')}
          >
            <IcfOptions empty={t('common.none')} />
          </select>
        </label>
        <label>
          {t('common.language')}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language | '')}
          >
            <LangOptions empty={t('upload.autoDetect')} />
          </select>
        </label>
      </div>
      <label className="mt">
        {t('common.note')}
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
  const { t } = useTranslation();
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
      title={t('project.newVersionTitle', { title: doc.title })}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('common.upload')}
      disabled={!file}
      busy={busy}
      error={error}
    >
      <FileDrop file={file} onFile={setFile} />
      <label>
        {t('common.note')}
        <input
          value={note}
          placeholder={t('project.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="check mt">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        {t('project.reviewedCopy')}
      </label>
    </Dialog>
  );
}
