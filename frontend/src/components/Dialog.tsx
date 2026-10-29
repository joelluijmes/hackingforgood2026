import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
  busy?: boolean;
  error?: string;
  wide?: boolean;
}

/** Modal form shell: title, body, error line, Cancel + submit. */
export default function Dialog(p: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${p.wide ? ' wide' : ''}`}
      onClose={p.onClose}
    >
      <form onSubmit={p.onSubmit}>
        <h2>{p.title}</h2>
        {p.children}
        {p.error && <p className="error">{p.error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={p.onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={p.disabled || p.busy}
          >
            {p.busy ? t('common.working') : p.submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function FileDrop({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="drop">
      <input
        type="file"
        accept=".docx,.pdf"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <strong>{file.name}</strong>
      ) : (
        <span>
          <strong>{t('common.dropFile')}</strong> {t('common.orBrowse')}
          <br />
          <small>{t('common.docxRecommended')}</small>
        </span>
      )}
    </label>
  );
}

export const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
