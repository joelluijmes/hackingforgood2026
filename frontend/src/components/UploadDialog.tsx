import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Audience, api, type Language } from '../api';
import Dialog, { errMsg, FileDrop } from './Dialog';
import { IcfOptions, LangOptions } from './Options';

interface Props {
  onClose: () => void;
  onDone: () => void;
  /** New version of an existing family: name/language/audience prefilled. */
  family?: {
    name: string;
    language: Language | null;
    audience: Audience | null;
  };
}

/** Upload a national template to the library (kind fixed to template). */
export default function UploadDialog({ onClose, onDone, family }: Props) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(family?.name ?? '');
  const [language, setLanguage] = useState<Language | ''>(
    family?.language ?? '',
  );
  const [audience, setAudience] = useState<Audience | ''>(
    family?.audience ?? 'adult',
  );
  const [version, setVersion] = useState('');
  const [released, setReleased] = useState('');
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
        released,
      });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={family ? t('templates.uploadVersion') : t('templates.upload')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('common.upload')}
      disabled={!file || (!!family && !version.trim())}
      busy={busy}
      error={error}
    >
      <FileDrop file={file} onFile={setFile} />
      <div className="grid2">
        {!family && (
          <label>
            {t('common.name')}
            <input
              value={name}
              placeholder={t('common.defaultsToFilename')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label>
          {t('common.version')}
          <input
            required={!!family}
            value={version}
            placeholder={t('templates.versionPlaceholder')}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <label>
          {t('templates.released')}
          <input
            type="date"
            value={released}
            onChange={(e) => setReleased(e.target.value)}
          />
        </label>
        <label>
          {t('common.language')}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language | '')}
          >
            <LangOptions empty={t('common.unknown')} />
          </select>
        </label>
        <label>
          {t('templates.audience')}
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience | '')}
          >
            <IcfOptions empty={t('common.unknown')} />
          </select>
        </label>
      </div>
    </Dialog>
  );
}
