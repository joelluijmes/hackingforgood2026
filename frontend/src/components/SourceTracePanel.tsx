import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  Citation,
  TraceEvidence,
  TraceKind,
  TraceParagraph,
  TracePassage,
  VersionSourceItem,
  VersionTrace,
} from '../api';
import { DiffText } from './EditCard';

const KINDS: TraceKind[] = [
  'template',
  'template_changed',
  'ai_fill',
  'other',
  'gap',
];

/** Link that opens a source document scrolled to the quoted passage. */
export function sourceHref(
  src: Pick<
    VersionSourceItem,
    'kind' | 'version_id' | 'template_id' | 'doc_id'
  >,
  passage?: string,
): string | null {
  const find = passage
    ? `?find=${encodeURIComponent(passage.slice(0, 160))}`
    : '';
  if (src.kind === 'template') {
    const id = src.template_id ?? src.doc_id;
    return id ? `/templates/${id}${find}` : null;
  }
  return src.version_id ? `/versions/${src.version_id}${find}` : null;
}

function SourceName({ s }: { s: VersionSourceItem }) {
  const { t } = useTranslation();
  return (
    <>
      <span className={`chip src-badge src-badge-${s.kind}`}>
        {t(`trace.kindSource.${s.kind}`)}
      </span>{' '}
      <b>{s.name}</b>
      {s.version_number
        ? ` · v${s.version_number}`
        : s.version
          ? ` · ${s.version}`
          : ''}
      {s.language && ` · ${s.language.toUpperCase()}`}
    </>
  );
}

/** A quoted source passage with where it sits and a link to open it there. */
function Passage({ p, weak = false }: { p: TracePassage; weak?: boolean }) {
  const { t } = useTranslation();
  const href = sourceHref(p.source as VersionSourceItem, p.sentence);
  return (
    <div className={`tr-passage${weak ? ' weak' : ''}`}>
      {weak && <div className="tr-weak">{t('trace.closestWeak')}</div>}
      <div className="tr-cite">
        <b>{p.source.name}</b>
        {p.source.version_number ? ` · v${p.source.version_number}` : ''}
        {p.section && <span className="muted"> › {p.section}</span>}
      </div>
      <blockquote className="tr-quote">{p.sentence}</blockquote>
      {href && (
        <Link className="link small" to={href}>
          {t('trace.openAtPassage')}
        </Link>
      )}
    </div>
  );
}

function Evidence({ ev }: { ev: TraceEvidence }) {
  const { t } = useTranslation();
  return (
    <div className={`tr-ev lv-${ev.level}`}>
      <div className="tr-ev-level">
        {t(`trace.level.${ev.level}`, { pct: Math.round(ev.score * 100) })}
      </div>
      {ev.missing_numbers.length > 0 && (
        <div className="tr-warn">
          {t('trace.missingNumbers', {
            numbers: ev.missing_numbers.join(', '),
          })}
        </div>
      )}
      {ev.passage && (
        <Passage
          p={ev.passage}
          weak={!['supported', 'partial'].includes(ev.level)}
        />
      )}
    </div>
  );
}

/** Text of a paragraph with the AI-filled parts marked. */
function Marked({ p }: { p: TraceParagraph }) {
  if (!p.fills?.length) return <>{p.text}</>;
  const parts: React.ReactNode[] = [];
  let rest = p.text;
  let k = 0;
  for (const f of p.fills) {
    const i = rest.indexOf(f);
    if (i < 0) continue;
    parts.push(rest.slice(0, i), <mark key={k++}>{f}</mark>);
    rest = rest.slice(i + f.length);
  }
  parts.push(rest);
  return <>{parts}</>;
}

function ParagraphCard({
  p,
  why,
  onJump,
  templateId,
}: {
  p: TraceParagraph;
  why?: string;
  onJump: (text: string) => void;
  templateId?: number;
}) {
  const { t } = useTranslation();
  const tplHref =
    templateId && p.template?.text
      ? `/templates/${templateId}?find=${encodeURIComponent(p.template.text.slice(0, 160))}`
      : null;
  return (
    <div className={`tr-card k-${p.kind}`}>
      <div className="tr-card-head">
        <span className={`tr-kind k-${p.kind}`}>
          {t(`trace.kind.${p.kind}`)}
          {p.template?.mandatory && p.kind !== 'ai_fill'
            ? ` · ${t('trace.mandatory')}`
            : ''}
        </span>
        <button
          type="button"
          className="link small"
          onClick={() => onJump(p.text)}
        >
          {t('trace.showInDocument')}
        </button>
      </div>
      {p.section && <div className="tr-section">{p.section}</div>}
      {why && <div className="tr-why">{why}</div>}
      {p.kind === 'template_changed' && p.template?.text ? (
        <>
          <div className="muted small">{t('trace.vsOfficial')}</div>
          <DiffText old={p.template.text} next={p.text} />
          {tplHref && (
            <Link className="link small" to={tplHref}>
              {t('trace.openInTemplate')}
            </Link>
          )}
        </>
      ) : (
        <p className="tr-text">
          <Marked p={p} />
        </p>
      )}
      {p.gaps && p.gaps.length > 0 && (
        <div className="tr-gaps">
          {p.gaps.map((g) => (
            <code key={g}>{g}</code>
          ))}
        </div>
      )}
      {p.evidence && <Evidence ev={p.evidence} />}
    </div>
  );
}

/** "Where is this from?" for a text selection in the document. */
export function CitationCard({
  c,
  onClose,
}: {
  c: Citation;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tplHref = c.template && sourceHref(c.template.source, c.template.text);
  const prev = c.previous;
  const nothing =
    !c.ai_fill &&
    !c.template &&
    !['supported', 'partial'].includes(c.sponsor?.level ?? '') &&
    !prev?.found;
  return (
    <section className="tr-citation" aria-live="polite">
      <div className="tr-card-head">
        <h3>{t('trace.citeTitle')}</h3>
        <button type="button" className="link small" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <blockquote className="tr-quote sel">{c.selection}</blockquote>
      {c.ai_fill && <div className="tr-badge ai">{t('trace.citeAiFill')}</div>}
      {c.template && (
        <div className="tr-cite-row">
          <div className="tr-cite-label">
            {t('trace.citeTemplate', {
              pct: Math.round(c.template.score * 100),
            })}
            {c.template.mandatory && (
              <span className="tr-kind k-mandatory">
                {t('trace.mandatory')}
              </span>
            )}
          </div>
          <div className="tr-cite">
            <SourceName s={c.template.source} />
            {c.template.section && (
              <span className="muted"> › {c.template.section}</span>
            )}
          </div>
          <blockquote className="tr-quote">{c.template.text}</blockquote>
          {tplHref && (
            <Link className="link small" to={tplHref}>
              {t('trace.openAtPassage')}
            </Link>
          )}
        </div>
      )}
      {c.sponsor && c.sponsor.level !== 'no_sponsor' && (
        <div className="tr-cite-row">
          <div className="tr-cite-label">{t('trace.citeSponsor')}</div>
          <Evidence ev={c.sponsor} />
        </div>
      )}
      {prev && (
        <div className="tr-cite-row">
          <div className="tr-cite-label">
            {prev.found
              ? t('trace.citeUnchanged', { n: prev.source.version_number })
              : t('trace.citeNew', { n: prev.source.version_number })}
          </div>
          {prev.found && prev.text && (
            <Link
              className="link small"
              to={sourceHref(prev.source, prev.text) ?? '#'}
            >
              {t('trace.openAtPassage')}
            </Link>
          )}
        </div>
      )}
      {nothing && <p className="muted small">{t('trace.citeNothing')}</p>}
    </section>
  );
}

export default function SourceTracePanel({
  trace,
  error,
  citation,
  citing,
  onClearCitation,
  onJump,
  coloured,
  onToggleColour,
}: {
  trace: VersionTrace | null;
  error: string;
  citation: Citation | null;
  citing: boolean;
  onClearCitation: () => void;
  onJump: (text: string) => void;
  coloured: boolean;
  onToggleColour: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'check' | 'sections'>('check');
  const [openSec, setOpenSec] = useState<number | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  const byIdx = useMemo(
    () => new Map((trace?.paragraphs ?? []).map((p) => [p.idx, p])),
    [trace],
  );
  const tplSource = trace?.sources.find((s) => s.kind === 'template');
  const tplId = tplSource?.template_id ?? tplSource?.doc_id;

  const groups = useMemo(() => {
    const g = { mandatory_changed: [], ai_unsupported: [], gap: [] } as Record<
      'mandatory_changed' | 'ai_unsupported' | 'gap',
      TraceParagraph[]
    >;
    for (const a of trace?.attention ?? []) {
      const p = byIdx.get(a.idx);
      if (p) g[a.type].push(p);
    }
    return g;
  }, [trace, byIdx]);

  const gapSections = useMemo(() => {
    const m = new Map<string, TraceParagraph[]>();
    for (const p of groups.gap) {
      const k = p.section || t('trace.startOfDocument');
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [groups, t]);

  const total = trace?.paragraphs.length ?? 0;
  const count = (k: TraceKind) => trace?.stats[k] ?? 0;
  const whyAi = (p: TraceParagraph) => {
    const ev = p.evidence;
    if (!ev) return undefined;
    if (ev.level === 'no_sponsor') return t('trace.whyNoSponsor');
    if (ev.missing_numbers.length) return t('trace.whyNumbers');
    return t('trace.whyNoSource');
  };

  return (
    <aside className="rv-panel tr-panel" aria-label={t('trace.title')}>
      <div className="rv-panel-head">
        <h2>{t('trace.title')}</h2>
        <p className="muted small">{t('trace.selectHint')}</p>
        {citing && <div className="muted small">{t('trace.citing')}</div>}
        {citation && <CitationCard c={citation} onClose={onClearCitation} />}
      </div>

      {error && <div className="rv-err tr-pad">{error}</div>}
      {!trace && !error && (
        <div className="muted tr-pad">{t('trace.loading')}</div>
      )}

      {trace && (
        <div className="tr-body">
          <section className="tr-sources">
            <h3>{t('trace.sourcesTitle')}</h3>
            {trace.sources.length === 0 && (
              <p className="muted small">{t('trace.noSources')}</p>
            )}
            <ul>
              {trace.sources.map((s, i) => {
                const href = sourceHref(s);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  <li key={i}>
                    <div>
                      <SourceName s={s} />
                    </div>
                    <div className="small muted">
                      {s.recorded ? t('trace.recorded') : t('trace.inferred')}
                      {s.relation && ` · ${s.relation}`}
                      {href && (
                        <>
                          {' · '}
                          <Link className="link" to={href}>
                            {t('common.open')}
                          </Link>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {trace.sources.some((s) => !s.recorded) && (
              <p className="tr-note small">{t('trace.inferredNote')}</p>
            )}
          </section>

          <section className="tr-coverage">
            <div className="tr-bar" aria-hidden="true">
              {KINDS.map((k) =>
                count(k) ? (
                  <span
                    key={k}
                    className={`k-${k}`}
                    style={{ flexGrow: count(k) }}
                  />
                ) : null,
              )}
            </div>
            <ul className="tr-legend">
              {KINDS.map((k) => (
                <li key={k}>
                  <span className={`tr-dot k-${k}`} />
                  {t(`trace.kind.${k}`)} <b>{count(k)}</b>
                </li>
              ))}
            </ul>
            <div className="muted small">
              {t('trace.paragraphsTotal', { count: total })}
              {trace.template.name &&
                (trace.template.applicable
                  ? ` · ${t('trace.comparedWith', { name: trace.template.name, version: trace.template.version ?? '' })}`
                  : ` · ${t('trace.templateNotApplicable')}`)}
            </div>
            <label className="tr-toggle">
              <input
                type="checkbox"
                checked={coloured}
                onChange={(e) => onToggleColour(e.target.checked)}
              />
              {t('trace.colourDocument')}
            </label>
          </section>

          <div className="rv-filters tr-views">
            <button
              type="button"
              aria-pressed={view === 'check'}
              onClick={() => setView('check')}
            >
              {t('trace.viewCheck', { count: trace.attention.length })}
            </button>
            <button
              type="button"
              aria-pressed={view === 'sections'}
              onClick={() => setView('sections')}
            >
              {t('trace.viewSections', { count: trace.sections.length })}
            </button>
          </div>

          {view === 'check' && (
            <div className="tr-list">
              {trace.attention.length === 0 && (
                <p className="muted">{t('trace.nothingToCheck')}</p>
              )}
              {groups.mandatory_changed.length > 0 && (
                <h4 className="tr-group">
                  {t('trace.groupMandatory', {
                    count: groups.mandatory_changed.length,
                  })}
                </h4>
              )}
              {groups.mandatory_changed.map((p) => (
                <ParagraphCard
                  key={p.idx}
                  p={p}
                  why={t('trace.whyMandatory')}
                  onJump={onJump}
                  templateId={tplId}
                />
              ))}
              {groups.ai_unsupported.length > 0 && (
                <h4 className="tr-group">
                  {t('trace.groupAi', { count: groups.ai_unsupported.length })}
                </h4>
              )}
              {groups.ai_unsupported.map((p) => (
                <ParagraphCard
                  key={p.idx}
                  p={p}
                  why={whyAi(p)}
                  onJump={onJump}
                  templateId={tplId}
                />
              ))}
              {groups.gap.length > 0 && (
                <>
                  <h4 className="tr-group">
                    {t('trace.groupGaps', { count: groups.gap.length })}
                  </h4>
                  <button
                    type="button"
                    className="link small"
                    onClick={() => setShowGaps(!showGaps)}
                  >
                    {showGaps ? t('trace.hide') : t('trace.showBySection')}
                  </button>
                  {showGaps &&
                    gapSections.map(([sec, ps]) => (
                      <details key={sec} className="tr-gap-sec">
                        <summary>
                          {sec} <span className="muted">({ps.length})</span>
                        </summary>
                        {ps.map((p) => (
                          <button
                            type="button"
                            key={p.idx}
                            className="tr-gap-row"
                            onClick={() => onJump(p.text)}
                          >
                            {(p.gaps ?? []).join(' · ') || p.text}
                          </button>
                        ))}
                      </details>
                    ))}
                </>
              )}
            </div>
          )}

          {view === 'sections' && (
            <div className="tr-list">
              {trace.sections.map((s, i) => {
                const n = Object.values(s.counts).reduce(
                  (a, b) => a + (b ?? 0),
                  0,
                );
                const paras = trace.paragraphs.filter(
                  (p) => (p.section || '(start of document)') === s.title,
                );
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: sections can repeat titles
                  <div key={i} className="tr-sec">
                    <button
                      type="button"
                      className="tr-sec-head"
                      aria-expanded={openSec === i}
                      onClick={() => setOpenSec(openSec === i ? null : i)}
                    >
                      <span className="tr-sec-title">{s.title}</span>
                      <span className="tr-bar mini" aria-hidden="true">
                        {KINDS.map((k) =>
                          s.counts[k] ? (
                            <span
                              key={k}
                              className={`k-${k}`}
                              style={{ flexGrow: s.counts[k] }}
                            />
                          ) : null,
                        )}
                      </span>
                      <span className="muted small">{n}</span>
                    </button>
                    {openSec === i &&
                      paras.map((p) => (
                        <ParagraphCard
                          key={p.idx}
                          p={p}
                          onJump={onJump}
                          templateId={tplId}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted small tr-pad">
            {t('trace.computedIn', { ms: trace.elapsed_ms })}
          </p>
        </div>
      )}
    </aside>
  );
}
