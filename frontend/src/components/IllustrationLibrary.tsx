import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Illustration } from '../api';
import { errMsg } from './Dialog';

/** Stock pictures used in children's (8-11) and adolescent forms; staff can add their own. */
export default function IllustrationLibrary() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Illustration[] | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [credit, setCredit] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listIllustrations().then(setItems, (e) => setError(errMsg(e)));
  }, []);
  useEffect(() => {
    load();
    api.illustrationTopics().then(setTopics, () => {});
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.uploadIllustration(file, { name, tags: [...tags], credit });
      setAdding(false);
      setFile(null);
      setName('');
      setTags(new Set());
      setCredit('');
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ill-lib">
      <div className="page-head">
        <div>
          <h2>{t('illustrations.title')}</h2>
          <p className="muted small">{t('illustrations.intro')}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setAdding(!adding)}
        >
          {t('illustrations.add')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {adding && (
        <form className="ill-add card" onSubmit={add}>
          <label>
            {t('illustrations.file')}
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            {t('common.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset>
            <legend>{t('illustrations.topicsLabel')}</legend>
            <div className="ill-topics">
              {topics.map((tp) => (
                <label key={tp} className="check">
                  <input
                    type="checkbox"
                    checked={tags.has(tp)}
                    onChange={(e) => {
                      const s = new Set(tags);
                      if (e.target.checked) s.add(tp);
                      else s.delete(tp);
                      setTags(s);
                    }}
                  />
                  {t(`illustrations.topics.${tp}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {t('illustrations.credit')}
            <input
              value={credit}
              placeholder={t('illustrations.creditPlaceholder')}
              onChange={(e) => setCredit(e.target.value)}
            />
          </label>
          <div className="row">
            <button
              type="submit"
              className="btn primary"
              disabled={!file || !tags.size || busy}
            >
              {busy ? t('common.working') : t('illustrations.save')}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setAdding(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
      {items === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="muted">{t('illustrations.empty')}</p>
      ) : (
        <ul className="ill-grid">
          {items.map((it) => (
            <li key={it.id} className="ill-item">
              <img src={api.illustrationFileUrl(it.id)} alt={it.name} />
              <b>{it.name}</b>
              <span className="muted small">
                {it.tags
                  .map((tp) => t(`illustrations.topics.${tp}`))
                  .join(', ')}
              </span>
              {it.credit && <span className="muted small">{it.credit}</span>}
              {!it.builtin && (
                <button
                  type="button"
                  className="link danger small"
                  onClick={() =>
                    api
                      .deleteIllustration(it.id)
                      .then(load, (e) => setError(errMsg(e)))
                  }
                >
                  {t('common.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
