import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { IcfOptions, LangOptions } from './Options';

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
  const { t } = useTranslation();
  const tIcf = (a: string) => t(`icfTypes.${a}`);
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
    const tpl = templates?.find((x) => String(x.id) === id);
    if (tpl?.audience) setIcf(tpl.audience);
    if (tpl?.language) setLanguage(tpl.language);
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
        title={t('generate.doneTitle')}
        onClose={onClose}
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
        submitLabel={t('common.close')}
      >
        <dl className="report">
          <dt>{t('generate.placeholders')}</dt>
          <dd>{r.placeholders_total}</dd>
          <dt>{t('generate.filled')}</dt>
          <dd>{r.filled}</dd>
          <dt>{t('generate.flagged')}</dt>
          <dd>{r.flagged}</dd>
          <dt>{t('generate.removedGuidance')}</dt>
          <dd>{r.removed_guidance_paragraphs}</dd>
          <dt>{t('generate.aiUsed')}</dt>
          <dd>{r.ai_used ? t('common.yes') : t('common.no')}</dd>
        </dl>
        {result.doc.versions[0] && (
          <Link
            className="btn primary"
            to={`/versions/${result.doc.versions[0].id}`}
          >
            {t('generate.openDraft')}
          </Link>
        )}
      </Dialog>
    );
  }

  if (busy) {
    return (
      <Dialog
        title={t('generate.title')}
        onClose={() => {}}
        onSubmit={(e) => e.preventDefault()}
        submitLabel={t('generate.submit')}
        busy
      >
        <div className="spinner-row">
          <span className="spinner" aria-hidden="true" />
          {t('generate.generating')}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={t('generate.title')}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t('generate.submit')}
      disabled={!templateId}
      error={error}
      wide
    >
      <div className="stack">
        <label>
          {t('generate.template')}
          <select
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
          >
            {templates === null && <option>{t('common.loading')}</option>}
            {templates?.length === 0 && (
              <option>{t('generate.noTemplates')}</option>
            )}
            {templates?.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.language?.toUpperCase() ?? '?'}
                {tpl.version ? `, v ${tpl.version}` : ''}
                {tpl.audience ? `, ${tIcf(tpl.audience)}` : ''})
              </option>
            ))}
          </select>
        </label>
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
          <label>
            {t('common.language')}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <LangOptions />
            </select>
          </label>
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
