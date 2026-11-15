const MAX_TAG_LENGTH = 32;

/** Cleans what the player typed into a tag: trimmed, inner spaces collapsed, length-capped. Empty means invalid. */
export function normalizeTag(text: string): string {
    return text.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH).trim();
}

/** Reads tags saved in a spell's flags, dropping anything that isn't a usable tag. */
export function readTags(saved: unknown): string[] {
    if (!Array.isArray(saved)) return [];
    return uniqueTags(saved.filter((t): t is string => typeof t === "string").map(normalizeTag));
}

/** Adds a tag unless it is empty or already present (case-insensitively). */
export function addTag(tags: readonly string[], text: string): string[] {
    return uniqueTags([...tags, normalizeTag(text)]);
}

export function removeTag(tags: readonly string[], tag: string): string[] {
    const key = tag.toLocaleLowerCase();
    return tags.filter((t) => t.toLocaleLowerCase() !== key);
}

/** Drops empty tags and case-insensitive duplicates, keeping the first spelling. */
export function uniqueTags(tags: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of tags) {
        const key = tag.toLocaleLowerCase();
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        result.push(tag);
    }
    return result;
}
