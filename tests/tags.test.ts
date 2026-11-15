import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { availableChips, rowMatches } from "../src/spellbook/filter.ts";
import { addTag, normalizeTag, readTags, removeTag } from "../src/spellbook/tags.ts";
import { actor, entry, spell } from "./fixtures/spellbook.ts";

describe("tag helpers", () => {
    it("normalizes typed text", () => {
        expect(normalizeTag("  boss   fight ")).toBe("boss fight");
        expect(normalizeTag("   ")).toBe("");
        expect(normalizeTag("x".repeat(50))).toHaveLength(32);
    });

    it("adds without duplicates, ignoring case", () => {
        expect(addTag(["Opener"], "opener")).toEqual(["Opener"]);
        expect(addTag(["Opener"], "  ")).toEqual(["Opener"]);
        expect(addTag(["Opener"], "Big AoE")).toEqual(["Opener", "Big AoE"]);
    });

    it("removes ignoring case", () => {
        expect(removeTag(["Opener", "Big AoE"], "big aoe")).toEqual(["Opener"]);
    });

    it("reads saved flags defensively", () => {
        expect(readTags(undefined)).toEqual([]);
        expect(readTags(["a", 3, " a ", "", "b"])).toEqual(["a", "b"]);
    });
});

describe("tags on rows", () => {
    const rows = () =>
        aggregateSpells(
            actor([
                entry("Prepared", "prepared", [spell("Heal", { id: "heal-a", tags: ["Opener"] })]),
                entry("Spontaneous", "spontaneous", [
                    spell("Heal", { id: "heal-b", tags: ["opener", "Emergency"] }),
                    spell("Fear"),
                ]),
            ]),
        );

    it("merges the tags of every spell in a row", () => {
        expect(rows().find((r) => r.name === "Heal")?.tags).toEqual(["Opener", "Emergency"]);
    });

    it("offers tags as chips and filters by them", () => {
        expect(availableChips(rows()).tag).toEqual(["Emergency", "Opener"]);
        const matched = rows().filter((r) => rowMatches(r, { search: "", chips: ["tag:Emergency"] }));
        expect(matched.map((r) => r.name)).toEqual(["Heal"]);
    });
});
