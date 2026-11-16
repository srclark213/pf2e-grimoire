/**
 * One-line summaries of an impulse from its description: the damage at the character's level, the save, and the
 * area. Impulse damage only lives in inline `@Damage[...]` rolls, written with level formulas such as
 * `@Damage[(floor((@actor.level -1)/2)+1)d8[bludgeoning]|options:area-damage]`.
 */

export interface ImpulseSummary {
    /** Resolved damage or healing rolls, e.g. ["7d8 bludgeoning"] */
    damage: string[];
    /** e.g. "basic Reflex", "Fortitude", or null */
    save: string | null;
    /** e.g. "30-foot cone", or null */
    area: string | null;
}

const SAVE_LABELS: Record<string, string> = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };

/** Looks up an inline roll's data path, such as "actor.level" or "actor.flags.system.kineticist.thermalNimbus" */
export type RollDataLookup = (path: string) => string | number | null | undefined;

/** A lookup that only knows the character's level */
export function levelLookup(level: number): RollDataLookup {
    return (path) => (path === "actor.level" || path === "item.level" || path === "item.rank" ? level : undefined);
}

export function summarizeImpulse(description: string, lookup: RollDataLookup): ImpulseSummary {
    const damage = inlineArgs(description, "@Damage")
        .map(({ args }) => resolveFormula(args.split("|")[0]!, lookup))
        .filter((formula, index, all) => formula && all.indexOf(formula) === index);

    const check = inlineArgs(description, "@Check").find(({ args }) => args.split("|")[0]! in SAVE_LABELS);
    const save = check ? saveLabel(check.args) : null;

    const template = inlineArgs(description, "@Template")[0];
    const area = template ? (template.label ?? templateLabel(template.args)) : null;

    return { damage, save, area };
}

function saveLabel(args: string): string {
    const [statistic, ...options] = args.split("|");
    const label = SAVE_LABELS[statistic!]!;
    return options.includes("basic") ? `basic ${label}` : label;
}

function templateLabel(args: string): string | null {
    const parts = Object.fromEntries(
        args.split("|").map((part, index) => {
            const [key, value] = part.includes(":") ? part.split(":") : [index === 0 ? "type" : part, ""];
            return [key!, value!];
        }),
    );
    if (!parts.type || !parts.distance) return null;
    return `${parts.distance}-foot ${parts.type}`;
}

/** Every `@Tag[args]{label}` in the text. Brackets nest, so this walks them rather than using a regex. */
function inlineArgs(html: string, tag: string): { args: string; label: string | null }[] {
    const found: { args: string; label: string | null }[] = [];
    const open = `${tag}[`;
    for (let start = html.indexOf(open); start !== -1; start = html.indexOf(open, start + 1)) {
        let depth = 0;
        let end = start + tag.length;
        for (; end < html.length; end++) {
            if (html[end] === "[") depth++;
            else if (html[end] === "]" && --depth === 0) break;
        }
        const args = html.slice(start + open.length, end);
        const label = html[end + 1] === "{" ? html.slice(end + 2, html.indexOf("}", end + 2)) : null;
        found.push({ args, label: label || null });
    }
    return found;
}

/**
 * Resolves a pf2e damage formula at a level into something readable:
 * `(floor((@actor.level -1)/2)+1)d8[bludgeoning]` at level 14 is "7d8 bludgeoning",
 * `4d6[persistent,bleed]` is "4d6 persistent bleed".
 */
export function resolveFormula(formula: string, lookup: RollDataLookup): string {
    // Unknown references drop out: better a damage type missing than "@actor.flags..." on screen.
    let text = formula.replace(/@([\w.]+)/g, (_match, path: string) => String(lookup(path) ?? ""));

    // Evaluate arithmetic in parentheses, innermost first: "(floor((14 -1)/2)+1)" -> "7".
    for (let previous = ""; previous !== text; ) {
        previous = text;
        text = text.replace(/(?:\b(floor|ceil|max|min))?\(([\d\s+\-*/.,]*)\)/g, (match, fn: string | undefined, inner: string) => {
            const args = inner.split(",").map((arg) => evaluate(arg));
            if (args.some((n) => n === null)) return match;
            const values = args as number[];
            switch (fn) {
                case "floor":
                    return String(Math.floor(values[0]!));
                case "ceil":
                    return String(Math.ceil(values[0]!));
                case "max":
                    return String(Math.max(...values));
                case "min":
                    return String(Math.min(...values));
                default:
                    return values.length === 1 ? String(values[0]) : match;
            }
        });
    }

    return text
        .replace(/\[\]/g, "")
        .replace(/\[([^\]]+)\]/g, (_match, tags: string) => ` ${tags.split(",").join(" ")}`)
        .replace(/[()]/g, "")
        .replace(/\s*\+\s*/g, " + ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Evaluates + - * / on numbers, or null if the text is anything else. */
function evaluate(expression: string): number | null {
    const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/]/g);
    if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return null;
    let index = 0;

    const factor = (): number | null => {
        const token = tokens[index++];
        if (token === "-") {
            const value = factor();
            return value === null ? null : -value;
        }
        const value = Number(token);
        return Number.isFinite(value) ? value : null;
    };
    const term = (): number | null => {
        let value = factor();
        while (value !== null && (tokens[index] === "*" || tokens[index] === "/")) {
            const op = tokens[index++];
            const right = factor();
            if (right === null) return null;
            value = op === "*" ? value * right : value / right;
        }
        return value;
    };
    let value = term();
    while (value !== null && (tokens[index] === "+" || tokens[index] === "-")) {
        const op = tokens[index++];
        const right = term();
        if (right === null) return null;
        value = op === "+" ? value + right : value - right;
    }
    return index === tokens.length ? value : null;
}
