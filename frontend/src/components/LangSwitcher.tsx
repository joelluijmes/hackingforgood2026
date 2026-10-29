import { useTranslation } from 'react-i18next';
import { applyLanguage, LANGS } from '../i18n';

/** Small language switcher for pages without a logged-in user. */
export default function LangSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <select
      aria-label={t('auth.yourLanguage')}
      className="lang-select"
      value={i18n.language}
      onChange={(e) => applyLanguage(e.target.value as (typeof LANGS)[number])}
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {t(`languagesNative.${l}`)}
        </option>
      ))}
    </select>
  );
}
