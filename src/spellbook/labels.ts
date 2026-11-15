/** Shortens a spellcasting entry name for a badge: "Divine Prepared Spells" becomes "Divine Prepared". */
export function badgeLabel(entryName: string): string {
    const trimmed = entryName.trim().replace(/\s+spells$/i, "");
    return trimmed || entryName.trim();
}

/** The rank cantrips and focus spells heighten to: half the character's level, rounded up, at least 1. */
export function cantripRank(level: number): number {
    return Math.max(1, Math.ceil(level / 2));
}
