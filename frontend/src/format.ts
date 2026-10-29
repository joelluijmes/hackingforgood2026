const LOCALES: Record<string, string> = {
  en: 'en-GB',
  nl: 'nl-BE',
  fr: 'fr-BE',
};
const loc = (lang: string) => LOCALES[lang] ?? 'en-GB';

export function formatDate(d: string | Date, lang: string): string {
  const t = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return String(d);
  return new Intl.DateTimeFormat(loc(lang), { dateStyle: 'medium' }).format(t);
}

export function formatDateTime(d: string | Date, lang: string): string {
  const t = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return String(d);
  return new Intl.DateTimeFormat(loc(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(t);
}

export function formatSize(n: number, lang: string): string {
  const unit = n < 1024 ? 'byte' : n < 1024 * 1024 ? 'kilobyte' : 'megabyte';
  const v =
    unit === 'byte' ? n : unit === 'kilobyte' ? n / 1024 : n / 1024 / 1024;
  return new Intl.NumberFormat(loc(lang), {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'megabyte' ? 1 : 0,
  }).format(v);
}
