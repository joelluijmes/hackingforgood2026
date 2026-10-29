import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type DiffResult, type Lang, type Version } from '../api';
import { CommentBody } from '../components/CommentPanel';
import '../review.css';

function Collapsed({ texts }: { texts: string[] }) {
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
          Collapse
        </button>
      </div>
    );
  return (
    <button
      type="button"
      className="df-collapsed"
      onClick={() => setOpen(true)}
    >
      {texts.length} unchanged paragraph{texts.length === 1 ? '' : 's'}
    </button>
  );
}

export default function DiffView() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const from = Number(sp.get('from'));
  const to = Number(sp.get('to'));
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setDiff(null);
    setError('');
    if (!from || !to) {
      setError('Pick two versions to compare.');
      return;
    }
    api.me().then(
      (m) => live && setLang(m.language),
      () => {},
    );
    api.diff(from, to).then(
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
  }, [from, to]);

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
          <Link to={`/versions/${to}`}>Back to version</Link>
        </div>
        <h1>Compare versions{title ? ` of ${title}` : ''}</h1>
        {opts.length > 0 && (
          <div className="df-sel">
            <label>
              From{' '}
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
              To{' '}
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
      {!diff && !error && <div className="muted">Comparing…</div>}
      {diff && (
        <>
          <div className="df-stats">
            <span className="chip">{diff.stats.inserted} inserted</span>
            <span className="chip">{diff.stats.deleted} deleted</span>
            <span className="chip">{diff.stats.changed} changed</span>
            <span className="chip">{diff.stats.unchanged} unchanged</span>
            <span className="chip">
              {diff.stats.tracked_changes} tracked changes
            </span>
          </div>
          <p>
            <Link to={`/versions/${diff.to.id}`}>
              Review comments in v{diff.to.number}
            </Link>
          </p>
          {diff.blocks.length === 0 && (
            <div className="empty">Both versions are empty.</div>
          )}
          {diff.stats.inserted + diff.stats.deleted + diff.stats.changed ===
            0 &&
            diff.blocks.length > 0 && (
              <div className="empty">
                No text differences between these versions.
              </div>
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
            <h2>Comments in this version</h2>
            <div className="df-clist">
              {diff.comments.added.length === 0 && (
                <div className="muted">No new comments.</div>
              )}
              {diff.comments.added.map((c) => (
                <div key={c.id} className="rv-card">
                  <CommentBody c={c} lang={lang} />
                </div>
              ))}
            </div>
          </section>
          <section className="df-section">
            <h2>Comments no longer present</h2>
            <div className="df-clist">
              {diff.comments.removed.length === 0 && (
                <div className="muted">No comments were removed.</div>
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
