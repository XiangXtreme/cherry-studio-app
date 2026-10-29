import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

export type ReferenceGalleryCategory = { category: string; count: number };

/** Searchable text: every visible label plus the stable id. */
function searchText(entry: ReferenceGalleryEntry) {
  return `${entry.title} ${entry.description} ${entry.category} ${entry.group ?? ''} ${entry.angle ?? ''} ${entry.id}`.toLowerCase();
}

/**
 * Space-separated terms are ANDed, matching the galleries' own search. A
 * category chip narrows first; the two filters compose.
 */
export function filterReferenceGalleryEntries(
  entries: readonly ReferenceGalleryEntry[],
  input: { category?: string; query: string },
): readonly ReferenceGalleryEntry[] {
  const terms = input.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const category = input.category;
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (terms.length === 0) return true;
    const text = searchText(entry);
    return terms.every((term) => text.includes(term));
  });
}

/** Categories in the order the catalog presents them, with their counts. */
export function referenceGalleryCategories(
  entries: readonly ReferenceGalleryEntry[],
): ReferenceGalleryCategory[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => ({ category, count }));
}
