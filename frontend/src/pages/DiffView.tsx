import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type DiffResult, type Lang, type Version } from '../api';
import { CommentBody } from '../components/CommentPanel';
import { isLang } from '../i18n';
import '../review.css';

function Collapsed({ texts }: { texts: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div>
        {texts.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list
          <div key={i} className="df-equal">
            {t}
          </div>
        ))}
        <button
          type="button"
          className="df-collapsed"
          onClick={() => setOpen(false)}
        >
          {t('diff.collapse')}
        </button>
      </div>
    );
  return (
    <button
      type="button"
      className="df-collapsed"
      onClick={() => setOpen(true)}
    >
      {t('diff.unchangedParagraphs', { count: texts.length })}
    </button>
  );
}

export default function DiffView() {
  const { t, i18n } = useTranslation();
  const lang = (isLang(i18n.language) ? i18n.language : 'en') as Lang;
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const from = Number(sp.get('from'));
  const to = Number(sp.get('to'));
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [pickError, setPickError] = useState(false);

  useEffect(() => {
    let live = true;
    setDiff(null);
    setError('');
    setPickError(false);
    if (!from || !to) {
      setPickError(true);
      return;
    }
    api.diff(from, to, lang).then(
      (d) => live && setDiff(d),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    api
      .getVersion(to)
      .then(async (d) => {
        const docs = await api.listProjectDocs(d.project.id);
        if (!live) return;
        setTitle(d.doc.title);
        setVersions(docs.find((x) => x.id === d.doc.id)?.versions ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [from, to, lang]);

  const go = (f: number, t: number) => nav(`/diff?from=${f}&to=${t}`);
  const opts = [...versions].sort((a, b) => a.number - b.number);

  const groups: ({ eq: string[] } | { block: DiffResult['blocks'][number] })[] =
    [];
  for (const b of diff?.blocks ?? []) {
    const last = groups[groups.length - 1];
    if (b.kind === 'equal') {
      if (last && 'eq' in last) last.eq.push(b.old ?? b.new ?? '');
      else groups.push({ eq: [b.old ?? b.new ?? ''] });
    } else groups.push({ block: b });
  }

  return (
    <div className="page wide">
      <div className="rv-head">
        <div className="rv-crumb">
          <Link to={`/versions/${to}`}>{t('diff.backToVersion')}</Link>
        </div>
        <h1>{title ? t('diff.titleOf', { title }) : t('diff.title')}</h1>
        {opts.length > 0 && (
          <div className="df-sel">
            <label>
              {t('diff.from')}{' '}
              <select
                className="rv-sel"
                value={from}
                onChange={(e) => go(Number(e.target.value), to)}
              >
                {opts.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('diff.to')}{' '}
              <select
                className="rv-sel"
                value={to}
                onChange={(e) => go(from, Number(e.target.value))}
              >
                {opts.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {pickError && <p className="error">{t('diff.pickTwo')}</p>}
      {!diff && !error && !pickError && (
        <div className="muted">{t('diff.comparing')}</div>
      )}
      {diff && (
        <>
          <div className="df-stats">
            <span className="chip">
              {t('diff.inserted', { count: diff.stats.inserted })}
            </span>
            <span className="chip">
              {t('diff.deleted', { count: diff.stats.deleted })}
            </span>
            <span className="chip">
              {t('diff.changed', { count: diff.stats.changed })}
            </span>
            <span className="chip">
              {t('diff.unchanged', { count: diff.stats.unchanged })}
            </span>
            <span className="chip">
              {t('diff.trackedChanges', { count: diff.stats.tracked_changes })}
            </span>
          </div>
          <p>
            <Link to={`/versions/${diff.to.id}`}>
              {t('diff.reviewComments', { number: diff.to.number })}
            </Link>
          </p>
          {diff.blocks.length === 0 && (
            <div className="empty">{t('diff.bothEmpty')}</div>
          )}
          {diff.stats.inserted + diff.stats.deleted + diff.stats.changed ===
            0 &&
            diff.blocks.length > 0 && (
              <div className="empty">{t('diff.noDifferences')}</div>
            )}
          {groups.map((g, i) =>
            'eq' in g ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <Collapsed key={i} texts={g.eq} />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <div key={i} className={`df-block ${g.block.kind}`}>
                {g.block.kind === 'insert' && (g.block.new ?? '')}
                {g.block.kind === 'delete' && (g.block.old ?? '')}
                {g.block.kind === 'replace' &&
                  (g.block.words
                    ? g.block.words.map((w, j) =>
                        w.op === 'ins' ? (
                          // biome-ignore lint/suspicious/noArrayIndexKey: static list
                          <ins key={j}>{w.text}</ins>
                        ) : w.op === 'del' ? (
                          // biome-ignore lint/suspicious/noArrayIndexKey: static list
                          <del key={j}>{w.text}</del>
                        ) : (
                          // biome-ignore lint/suspicious/noArrayIndexKey: static list
                          <span key={j}>{w.text}</span>
                        ),
                      )
                    : g.block.new)}
              </div>
            ),
          )}
          <section className="df-section">
            <h2>{t('diff.commentsIn')}</h2>
            <div className="df-clist">
              {diff.comments.added.length === 0 && (
                <div className="muted">{t('diff.noNew')}</div>
              )}
              {diff.comments.added.map((c) => (
                <div key={c.id} className="rv-card">
                  <CommentBody c={c} lang={lang} />
                </div>
              ))}
            </div>
          </section>
          <section className="df-section">
            <h2>{t('diff.commentsGone')}</h2>
            <div className="df-clist">
              {diff.comments.removed.length === 0 && (
                <div className="muted">{t('diff.noRemoved')}</div>
              )}
              {diff.comments.removed.map((c) => (
                <div key={c.id} className="rv-card">
                  <CommentBody c={c} lang={lang} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
