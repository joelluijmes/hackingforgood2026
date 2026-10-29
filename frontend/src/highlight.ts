/** Locate a quoted passage in rendered document HTML, scroll to it and flash it. */

const BLOCKS = 'p, li, td, h1, h2, h3, h4';

export const normText = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[“”«»"]/g, '"')
    .trim()
    .toLowerCase();

/** The smallest block element whose text contains `text` (or its first 80 characters). */
export function findBlock(root: HTMLElement, text: string): HTMLElement | null {
  const want = normText(text);
  if (!want) return null;
  const probes = [want, want.slice(0, 80), want.slice(0, 40)].filter(
    (p, i, a) => p.length >= 12 && a.indexOf(p) === i,
  );
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));
  for (const probe of probes) {
    const hit = blocks.find((b) => {
      if (b.querySelector(BLOCKS)) return false; // prefer the innermost block
      return normText(b.textContent ?? '').includes(probe);
    });
    if (hit) return hit;
  }
  return null;
}

/** Scroll to and briefly highlight the passage; returns false when it is not found. */
export function flashText(root: HTMLElement | null, text: string): boolean {
  if (!root) return false;
  const el = findBlock(root, text);
  if (!el) return false;
  for (const old of root.querySelectorAll('.cite-hit'))
    old.classList.remove('cite-hit');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('cite-hit');
  return true;
}
