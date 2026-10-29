import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { IcfType, Lang, MatrixCell, ProjectProgress } from '../api';

const COLS: Lang[] = ['en', 'nl', 'fr'];

export default function IcfMatrix({
  matrix,
  busyLangs,
  onGenerate,
  onTranslate,
}: {
  matrix: ProjectProgress['matrix'];
  /** doc ids currently translating, to disable buttons */
  busyLangs: Set<string>;
  onGenerate: (icf: IcfType) => void;
  onTranslate: (
    enCell: MatrixCell,
    icf: IcfType,
    langs: ('nl' | 'fr')[],
  ) => void;
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
            return (
              <tr key={row.icf_type}>
                <th scope="row">
                  {t(`icfTypes.${row.icf_type}`)}
                  {en && both && (
                    <div>
                      <button
                        type="button"
                        className="link"
                        disabled={busyLangs.has(`${en.doc_id}`)}
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
                        </div>
                      </td>
                    );
                  if (l === 'en')
                    return (
                      <td key={l}>
                        <button
                          type="button"
                          className="btn"
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
                        className="btn"
                        disabled={!en || busyLangs.has(`${en.doc_id}:${l}`)}
                        title={en ? undefined : t('matrix.needEn')}
                        onClick={() =>
                          en &&
                          onTranslate(en, row.icf_type, [l as 'nl' | 'fr'])
                        }
                      >
                        {t('matrix.translateFromEn')}
                      </button>
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
