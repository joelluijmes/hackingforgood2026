import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type Document,
  type IcfType,
  type Language,
  type ProjectDoc,
} from '../api';
import Dialog, { errMsg } from './Dialog';
import { IcfOptions } from './Options';
import type { TaskMeta } from './TaskBanner';

interface Props {
  projectId: number;
  docs: ProjectDoc[];
  preset?: { icf: IcfType; language: Language };
  onClose: () => void;
  onStarted: (m: TaskMeta) => void;
}

const newest = (a: Document, b: Document) =>
  (b.released ?? '').localeCompare(a.released ?? '') ||
  (b.version ?? '').localeCompare(a.version ?? '', undefined, {
    numeric: true,
  });

export default function GenerateDialog({
  projectId,
  docs,
  preset,
  onClose,
  onStarted,
}: Props) {
  const { t } = useTranslation();
  const sponsors = docs.filter((d) => d.role === 'sponsor' && d.versions[0]);
  const [templates, setTemplates] = useState<Document[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [icf, setIcf] = useState<IcfType>(preset?.icf ?? 'adult');
  const language: Language = 'en';
  const [picked, setPicked] = useState<Set<number>>(
    new Set(sponsors.map((d) => d.versions[0].id)),
  );
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listDocuments('template')
      .then((t) => {
        setTemplates(t);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  const forLang = (templates ?? [])
    .filter((x) => x.language === language)
    .sort(newest);
  const chosen = forLang.find((x) => String(x.id) === templateId) ?? forLang[0];
  const isLatest = chosen === forLang[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.generate(projectId, {
        template_id: isLatest ? undefined : chosen?.id,
        icf_type: icf,
        language,
        sponsor_version_ids: [...picked],
        notes,
        title: title || undefined,
      });
      onStarted({
        id: r.task_id,
        kind: 'generate',
        langs: language,
        icfType: icf,
      });
      onClose();
      return;
    } catch (err) {
      setError(errMsg(err));
    }
    setBusy(false);
  }

  return (
    <Dialog
      title={t('generate.title')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('generate.submit')}
      disabled={!chosen}
      busy={busy}
      error={error}
      wide
    >
      <div className="stack">
        <div className="grid2">
          <label>
            {t('generate.icfType')}
            <select
              value={icf}
              onChange={(e) => setIcf(e.target.value as IcfType)}
            >
              <IcfOptions />
            </select>
          </label>
        </div>
        <p className="muted small">{t('generate.englishOnly')}</p>
        <div className="tpl-line">
          {templates === null ? (
            <span className="muted">{t('common.loading')}</span>
          ) : chosen ? (
            <>
              <span>
                {t('generate.templateLine', {
                  lang: t(`languages.${language}`),
                  version: chosen.version ?? '?',
                })}
                {isLatest && ` ${t('generate.latest')}`}
              </span>
              {forLang.length > 1 && (
                <label className="small">
                  {t('generate.otherVersion')}
                  <select
                    value={chosen.id}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {forLang.map((x) => (
                      <option key={x.id} value={x.id}>
                        v{x.version ?? '?'} ({x.released ?? x.name})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="error">
              {t('generate.noTemplateForLang', {
                lang: t(`languages.${language}`),
              })}
            </p>
          )}
        </div>
        <fieldset>
          <legend>{t('generate.sponsorDocs')}</legend>
          {sponsors.length === 0 && (
            <p className="muted">{t('generate.noSponsorDocs')}</p>
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
          {t('generate.notes')}
          <textarea
            rows={3}
            value={notes}
            placeholder={t('generate.notesPlaceholder')}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label>
          {t('generate.titleOptional')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}
