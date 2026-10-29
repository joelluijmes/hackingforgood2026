import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type GlobalFacts } from '../api';
import { errMsg } from '../components/Dialog';
import { FactFields } from '../components/StudyProfile';

export default function Settings() {
  const { t } = useTranslation();
  const [data, setData] = useState<GlobalFacts | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const apply = useCallback((g: GlobalFacts) => {
    setData(g);
    setDraft({ ...g.values });
  }, []);
  useEffect(() => {
    api.getGlobalFacts().then(apply, (e) => setError(errMsg(e)));
  }, [apply]);

  if (!data)
    return (
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  const changed = data.schema
    .map((f) => f.key)
    .filter((k) => (draft[k] ?? '').trim() !== (data.values[k] ?? ''));

  async function save() {
    setError('');
    try {
      apply(
        await api.putGlobalFacts(
          Object.fromEntries(changed.map((k) => [k, draft[k] ?? ''])),
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-head">
        <h1>{t('facts.settingsTitle')}</h1>
        <p className="muted">{t('facts.settingsLead')}</p>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={changed.length === 0}
          onClick={save}
        >
          {saved ? t('facts.saved') : t('facts.save')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <FactFields
        schema={data.schema}
        values={draft}
        onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
      />
    </div>
  );
}
