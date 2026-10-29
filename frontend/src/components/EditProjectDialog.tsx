import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  api,
  type FactSuggestion,
  type Project,
  type ProjectFacts,
} from '../api';
import { errMsg } from './Dialog';
import { FactFields, ReviewDialog } from './StudyProfile';

export type EditTab = 'project' | 'contacts' | 'study';
const TAB_GROUPS: Record<'contacts' | 'study', string[]> = {
  contacts: ['contacts', 'site', 'privacy', 'ethics', 'insurance'],
  study: ['study'],
};

const own = (f: ProjectFacts) =>
  Object.fromEntries(
    Object.entries(f.facts).map(([k, v]) => [
      k,
      v.source === 'global' ? '' : v.value,
    ]),
  );

/** Edit project: name/study/description + study-profile facts, saved with one button. */
export default function EditProjectDialog({
  project,
  hasSponsorDocs,
  initialTab = 'project',
  onClose,
  onSaved,
}: {
  project: Project;
  hasSponsorDocs: boolean;
  initialTab?: EditTab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [meta, setMeta] = useState({
    name: project.name,
    study: project.study ?? '',
    description: project.description ?? '',
  });
  const [facts, setFacts] = useState<ProjectFacts | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'infer' | ''>('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<FactSuggestion[] | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    api.getProjectFacts(project.id).then(
      (f) => {
        setFacts(f);
        setDraft(own(f));
      },
      (e) => setError(errMsg(e)),
    );
  }, [project.id]);

  const schema = facts?.schema.filter((f) => f.scope !== 'global') ?? [];
  const factChanges = facts
    ? Object.entries(draft).filter(
        ([k, v]) => v.trim() !== (own(facts)[k] ?? ''),
      )
    : [];
  const metaChanged =
    meta.name !== project.name ||
    meta.study !== (project.study ?? '') ||
    meta.description !== (project.description ?? '');
  const dirty = metaChanged || factChanges.length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      if (metaChanged)
        await api.updateProject(project.id, {
          name: meta.name.trim() || project.name,
          study: meta.study.trim(),
          description: meta.description.trim(),
        });
      if (factChanges.length)
        await api.putProjectFacts(project.id, Object.fromEntries(factChanges));
      onSaved();
      onClose();
    } catch (err) {
      setError(errMsg(err));
      setBusy('');
    }
  }
  async function infer() {
    setBusy('infer');
    setError('');
    try {
      setSuggestions((await api.inferProjectFacts(project.id)).suggestions);
    } catch (e) {
      const m = errMsg(e);
      setError(
        m.includes('no_sponsor')
          ? t('facts.noSponsor')
          : m.includes('ai_unavailable')
            ? t('facts.aiOff')
            : m.includes('ai_failed')
              ? t('facts.aiFail')
              : m,
      );
    }
    setBusy('');
  }

  const tabs: [EditTab, string][] = [
    ['project', t('facts.tabProject')],
    ['contacts', t('facts.tabContacts')],
    ['study', t('facts.tabStudy')],
  ];

  return (
    <dialog ref={ref} className="dialog edit-project" onClose={onClose}>
      <form onSubmit={save}>
        <div className="ep-head">
          <h2>{t('facts.editProject')}</h2>
          {facts && (
            <span className="chip">
              {t('facts.filled', { filled: facts.filled, total: facts.total })}
            </span>
          )}
        </div>
        <div className="ep-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? 'active' : ''}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ep-body">
          {tab === 'project' && (
            <div className="stack">
              <label className="field">
                {t('facts.name')}
                <input
                  required
                  value={meta.name}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                />
              </label>
              <label className="field">
                {t('facts.study')}
                <input
                  value={meta.study}
                  onChange={(e) => setMeta({ ...meta, study: e.target.value })}
                />
              </label>
              <label className="field">
                {t('facts.description')}
                <textarea
                  rows={4}
                  value={meta.description}
                  onChange={(e) =>
                    setMeta({ ...meta, description: e.target.value })
                  }
                />
              </label>
            </div>
          )}
          {tab !== 'project' && (
            <>
              <div className="ep-toolbar">
                <p className="muted">{t('facts.inheritHint')}</p>
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== '' || !hasSponsorDocs}
                  title={hasSponsorDocs ? undefined : t('facts.noSponsor')}
                  onClick={infer}
                >
                  {busy === 'infer' ? t('facts.inferring') : t('facts.infer')}
                </button>
              </div>
              {facts && (
                <FactFields
                  schema={schema}
                  groups={TAB_GROUPS[tab]}
                  values={draft}
                  inherited={facts.globals}
                  sources={Object.fromEntries(
                    Object.entries(facts.facts).map(([k, v]) => [k, v.source]),
                  )}
                  onChange={(k, v) => {
                    setDraft((d) => ({ ...d, [k]: v }));
                  }}
                />
              )}
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={!dirty || busy !== ''}
          >
            {busy === 'save' ? t('common.working') : t('facts.save')}
          </button>
        </div>
      </form>
      {suggestions && facts && (
        <ReviewDialog
          pid={project.id}
          schema={facts.schema}
          suggestions={suggestions}
          onClose={() => setSuggestions(null)}
          onSaved={(f) => {
            // accepted suggestions are already saved; keep other unsaved edits
            const fresh = own(f);
            setFacts(f);
            setDraft({
              ...fresh,
              ...Object.fromEntries(factChanges.filter(([k]) => !fresh[k])),
            });
            onSaved();
          }}
        />
      )}
    </dialog>
  );
}
