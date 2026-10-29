import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { IcfType, Language, ProjectDoc } from '../api';

const ROWS: IcfType[] = ['adult', 'parent', 'adolescent', 'child'];
const COLS: Language[] = ['en', 'nl', 'fr'];

/** The ICF set at a glance: 4 audiences × 3 languages, latest version of each. */
export default function IcfMatrix({ docs }: { docs: ProjectDoc[] }) {
  const { t } = useTranslation();
  const icfs = docs.filter((d) => d.role === 'icf');
  if (!icfs.length) return null;
  const find = (t: IcfType, l: Language) =>
    icfs.filter((d) => d.icf_type === t && d.language === l);
  return (
    <section className="group">
      <h2>{t('matrix.title')}</h2>
      <table className="mx">
        <thead>
          <tr>
            <th />
            {COLS.map((l) => (
              <th key={l}>{l.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r}>
              <th scope="row">{t(`matrix.rows.${r}`)}</th>
              {COLS.map((l) => {
                const list = find(r, l);
                if (!list.length)
                  return (
                    <td key={l} className="mx-empty">
                      —
                    </td>
                  );
                return (
                  <td key={l}>
                    {list.map((d) => {
                      const v = d.versions[0];
                      return (
                        <Link
                          key={d.id}
                          to={`/versions/${v.id}`}
                          className="mx-cell"
                        >
                          <span className="mx-ver">v{v.number}</span>
                          <span className={`chip src-${v.source}`}>
                            {t(`sources.${v.source}`)}
                          </span>
                          {v.comments_open > 0 && (
                            <span className="chip warn">
                              {t('matrix.open', { count: v.comments_open })}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
