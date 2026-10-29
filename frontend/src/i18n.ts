import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from './api';
import en from './locales/en.json';
import fr from './locales/fr.json';
import nl from './locales/nl.json';

export const LANGS: Language[] = ['en', 'nl', 'fr'];
const KEY = 'icf-studio-lang';

export const isLang = (v: unknown): v is Language =>
  v === 'en' || v === 'nl' || v === 'fr';

/** Language before login: remembered choice, else the browser language. */
function initialLang(): Language {
  try {
    const s = localStorage.getItem(KEY);
    if (isLang(s)) return s;
  } catch {
    /* storage unavailable */
  }
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
}

/** Switch the UI language, remember it and update <html lang>. */
export function applyLanguage(l: Language) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* storage unavailable */
  }
  return i18n.changeLanguage(l);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    nl: { translation: nl },
    fr: { translation: fr },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l;
});

export default i18n;
