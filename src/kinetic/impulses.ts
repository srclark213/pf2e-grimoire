import type { InfusionTarget, KineticItemSnapshot, KineticSnapshot } from "./model.ts";
import { ELEMENTS } from "./model.ts";
import { channelRiderOpen, liveInfusion, overflowUsed, ridesChannel } from "./state.ts";
import { levelLookup, summarizeImpulse, type ImpulseSummary, type RollDataLookup } from "./summary.ts";

/** Why an impulse can't be used right now */
export type Block = { key: "AuraDormant" } | { key: "OverflowUsed" };

/** What using it will also do */
export type Warning =
    | { key: "EndsAura" }
    | { key: "EndsStances"; names: string }
    | { key: "ReplacesStance"; names: string }
    | { key: "WastesInfusion"; infusion: string };

export type Section = "stance" | "impulse" | "overflow" | "reaction";
export const SECTIONS: readonly Section[] = ["stance", "impulse", "overflow", "reaction"];

export interface ImpulseRow {
    item: KineticItemSnapshot;
    elements: string[];
    overflow: boolean;
    stance: boolean;
    composite: boolean;
    section: Section;
    summary: ImpulseSummary;
    blocks: Block[];
    warnings: Warning[];
    /** Why it stands out right now: a primed infusion applies to it, or it rides along with Channel Elements */
    highlight: "infusion" | "channel" | null;
}

export function elementsOf(traits: readonly string[]): string[] {
    return ELEMENTS.filter((element) => traits.includes(element));
}

export function sectionOf(item: KineticItemSnapshot): Section {
    const traits = item.traits;
    if (traits.includes("stance")) return "stance";
    if (item.cost === "reaction" || item.cost === "free") return "reaction";
    if (traits.includes("overflow")) return "overflow";
    return "impulse";
}

/** The impulse rows, with what blocks each one and what using it would also do. */
export function impulseRows(snapshot: KineticSnapshot, lookup: RollDataLookup = levelLookup(snapshot.level)): ImpulseRow[] {
    const infusion = liveInfusion(snapshot.state, snapshot.now);
    const chainRunning = !!infusion?.chain && infusion.chain.blasts > 0;
    const usedOverflow = overflowUsed(snapshot.state, snapshot.now);
    const channelOpen = channelRiderOpen(snapshot.state, snapshot.now);
    const stances = snapshot.effects.filter((e) => e.stance).map((e) => e.name);

    return snapshot.impulses.map((item) => {
        const traits = item.traits;
        const overflow = traits.includes("overflow");
        const stance = traits.includes("stance");

        const blocks: Block[] = [];
        if (!snapshot.aura.active) blocks.push({ key: "AuraDormant" });
        if (overflow && usedOverflow) blocks.push({ key: "OverflowUsed" });

        const warnings: Warning[] = [];
        if (overflow) {
            warnings.push({ key: "EndsAura" });
            if (stances.length > 0) warnings.push({ key: "EndsStances", names: stances.join(", ") });
        }
        if (stance && stances.length > 0) warnings.push({ key: "ReplacesStance", names: stances.join(", ") });
        if (infusion && !chainRunning && infusion.target === "blast") {
            warnings.push({ key: "WastesInfusion", infusion: infusion.name });
        }

        const highlight =
            infusion && !chainRunning && infusion.target === "impulse"
                ? "infusion"
                : channelOpen && ridesChannel({ kind: "impulse", cost: item.cost, stance })
                  ? "channel"
                  : null;

        return {
            item,
            elements: elementsOf(traits),
            overflow,
            stance,
            composite: traits.includes("composite"),
            section: sectionOf(item),
            summary: summarizeImpulse(item.description, lookup),
            blocks,
            warnings,
            highlight,
        };
    });
}

export interface BlastStatus {
    blocks: Block[];
    /** A primed infusion applies to the next blast */
    infused: boolean;
    /** It can ride along with Channel Elements (only a 1-action blast can) */
    channel: "free" | "needs-one-action" | null;
}

export function blastStatus(snapshot: KineticSnapshot): BlastStatus {
    const infusion = liveInfusion(snapshot.state, snapshot.now);
    const channelOpen = channelRiderOpen(snapshot.state, snapshot.now);
    return {
        blocks: snapshot.aura.active ? [] : [{ key: "AuraDormant" }],
        infused: !!infusion,
        channel: !channelOpen ? null : snapshot.blast?.cost === 1 ? "free" : "needs-one-action",
    };
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/**
 * What an infusion modifies, read from its text: "If your next action is an Elemental Blast..." or "...is an
 * impulse". Chain Infusion also says how long the chain can run ("up to five blasts total").
 */
export function infusionTarget(description: string): { target: InfusionTarget; chain: number | null } {
    const text = plainText(description);
    const next = /next action (?:you use )?is an? ([a-z ]+?)(?:[,.;]| and | it )/i.exec(text)?.[1]?.toLowerCase() ?? "";
    const target: InfusionTarget = next.includes("elemental blast") ? "blast" : "impulse";
    const chainMatch = /up to (\w+) blasts total/i.exec(text);
    const chainWord = chainMatch?.[1]?.toLowerCase();
    const chain = chainWord ? (NUMBER_WORDS[chainWord] ?? (Number(chainWord) || null)) : null;
    return { target, chain };
}

/** Description HTML as plain text: tags stripped, @UUID[...]{Label} reduced to its label */
export function plainText(html: string): string {
    return html
        .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
        // pf2e source data links by name with no label: @UUID[Compendium.pf2e.actionspf2e.Item.Elemental Blast]
        .replace(/@UUID\[[^\]]*\.Item\.([^\]]*)\]/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
