import type { Stage } from './api';

export type DocStatus = {
  key:
    | 'draft'
    | 'awaitingReview'
    | 'reviewed'
    | 'approvedAsIs'
    | 'translated'
    | 'inEthics'
    | 'ethicsFeedback'
    | 'final'
    | 'uploaded';
  tone: 'neutral' | 'warn' | 'ok';
};

/** Human status of an ICF document, derived from the project stage and its latest version. */
export function docStatus(
  stage: Stage,
  d: { source: string; approved?: boolean | null; language?: string | null },
): DocStatus {
  const reviewed = d.source === 'reviewed' || !!d.approved;
  const translated = !!d.language && d.language !== 'en';
  if (stage === 'approved') return { key: 'final', tone: 'ok' };
  if (stage === 'ethics_review') {
    if (translated)
      return d.source === 'reviewed'
        ? { key: 'ethicsFeedback', tone: 'warn' }
        : { key: 'inEthics', tone: 'neutral' };
    return { key: 'reviewed', tone: 'ok' };
  }
  if (d.source === 'upload') return { key: 'uploaded', tone: 'neutral' };
  if (stage === 'pi_review') {
    if (d.approved) return { key: 'approvedAsIs', tone: 'ok' };
    if (translated) return { key: 'translated', tone: 'neutral' };
    return reviewed
      ? { key: 'reviewed', tone: 'ok' }
      : { key: 'awaitingReview', tone: 'warn' };
  }
  return { key: 'draft', tone: 'neutral' };
}
