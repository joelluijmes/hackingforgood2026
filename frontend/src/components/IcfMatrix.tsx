import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { IcfType, Lang, MatrixCell, ProjectProgress } from '../api';

const COLS: Lang[] = ['en', 'nl', 'fr'];

/** One place for the translation gate (later: doc-level approved flag). */
export const isReviewed = (c: MatrixCell | null) =>
  c?.source === 'reviewed' || c?.approved === true;

export default function IcfMatrix({
  matrix,
  busyLangs,
  onGenerate,
  onTranslate,
  onUpdate,
}: {
  matrix: ProjectProgress['matrix'];
  /** doc ids currently translating, to disable buttons */
  busyLangs: Set<string>;
  onGenerate: (icf: IcfType) => void;
  onTranslate: (
    enCell: MatrixCell,
    icf: IcfType,
    langs: ('nl' | 'fr')[],
    force?: boolean,
  ) => void;
  onUpdate: (cell: MatrixCell, icf: IcfType, lang: Lang) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="matrix-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th>{t('matrix.type')}</th>
            {COLS.map((l) => (
              <th key={l}>{l.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => {
            const en = row.languages.en;
            const both = !row.languages.nl && !row.languages.fr;
            const ok = isReviewed(en);
            return (
              <tr key={row.icf_type}>
                <th scope="row">
                  {t(`icfTypes.${row.icf_type}`)}
                  {en && both && (
                    <div>
                      <button
                        type="button"
                        className="link"
                        disabled={!ok || busyLangs.has(`${en.doc_id}`)}
                        title={ok ? undefined : t('matrix.needReview')}
                        onClick={() =>
                          onTranslate(en, row.icf_type, ['nl', 'fr'])
                        }
                      >
                        {t('matrix.translateBoth')}
                      </button>
                    </div>
                  )}
                </th>
                {COLS.map((l) => {
                  const c = row.languages[l];
                  if (c)
                    return (
                      <td key={l}>
                        <div className="cell">
                          <span className={`chip src-${c.source}`}>
                            {t('matrix.chip', {
                              n: c.version_number,
                              source: t(`sources.${c.source}`),
                            })}
                          </span>
                          {c.approved && (
                            <span className="chip ok">
                              {t('project.approvedAsIs')}
                            </span>
                          )}
                          {c.comments_open > 0 && (
                            <span className="chip warn">
                              {t('project.countOpen', {
                                count: c.comments_open,
                              })}
                            </span>
                          )}
                          <Link
                            className="link"
                            to={`/versions/${c.version_id}`}
                          >
                            {t('common.open')}
                          </Link>
                          {c.source === 'upload' && (
                            <button
                              type="button"
                              className="link"
                              onClick={() => onUpdate(c, row.icf_type, l)}
                            >
                              {t('matrix.updateTemplate')}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  if (l === 'en')
                    return (
                      <td key={l}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => onGenerate(row.icf_type)}
                        >
                          {t('matrix.generate')}
                        </button>
                      </td>
                    );
                  return (
                    <td key={l}>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={
                          !en || !ok || busyLangs.has(`${en.doc_id}:${l}`)
                        }
                        title={
                          !en
                            ? t('matrix.needEn')
                            : ok
                              ? undefined
                              : t('matrix.needReview')
                        }
                        onClick={() =>
                          en &&
                          onTranslate(en, row.icf_type, [l as 'nl' | 'fr'])
                        }
                      >
                        {t('matrix.translateFromEn')}
                      </button>
                      {en && !ok && (
                        <button
                          type="button"
                          className="link small"
                          onClick={() =>
                            onTranslate(
                              en,
                              row.icf_type,
                              [l as 'nl' | 'fr'],
                              true,
                            )
                          }
                        >
                          {t('matrix.translateAnyway')}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">{t('matrix.note')}</p>
    </div>
  );
}
