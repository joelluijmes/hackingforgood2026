import { useTranslation } from 'react-i18next';
import { LANGS } from '../i18n';

const ICF_TYPES = ['adult', 'parent', 'adolescent', 'child'] as const;

/** <option>s for a language select; `empty` adds a blank choice with that label. */
export function LangOptions({ empty }: { empty?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {t(`languages.${l}`)}
        </option>
      ))}
    </>
  );
}

/** <option>s for an ICF type / audience select. */
export function IcfOptions({ empty }: { empty?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {ICF_TYPES.map((k) => (
        <option key={k} value={k}>
          {t(`icfTypes.${k}`)}
        </option>
      ))}
    </>
  );
}
