import { Link } from 'react-router-dom';
import type { IcfType, Language, ProjectDoc } from '../api';

const ROWS: { type: IcfType; label: string }[] = [
  { type: 'adult', label: 'Adult 18+' },
  { type: 'parent', label: 'Parents' },
  { type: 'adolescent', label: 'Adolescent 12–17' },
  { type: 'child', label: 'Child 8–11' },
];
const COLS: Language[] = ['en', 'nl', 'fr'];

/** The ICF set at a glance: 4 audiences × 3 languages, latest version of each. */
export default function IcfMatrix({ docs }: { docs: ProjectDoc[] }) {
  const icfs = docs.filter((d) => d.role === 'icf');
  if (!icfs.length) return null;
  const find = (t: IcfType, l: Language) =>
    icfs.filter((d) => d.icf_type === t && d.language === l);
  return (
    <section className="group">
      <h2>ICF set</h2>
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
            <tr key={r.type}>
              <th scope="row">{r.label}</th>
              {COLS.map((l) => {
                const list = find(r.type, l);
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
                            {v.source}
                          </span>
                          {v.comments_open > 0 && (
                            <span className="chip warn">
                              {v.comments_open} open
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
