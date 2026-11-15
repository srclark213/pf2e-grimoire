import { describe, expect, it } from "vitest";
import manifest from "../static/module.json";
import pkg from "../package.json";
import { MODULE_ID } from "../src/constants.ts";

describe("module.json", () => {
    it("uses the module id from the code", () => {
        expect(manifest.id).toBe(MODULE_ID);
    });

    it("matches the package version", () => {
        expect(manifest.version).toBe(pkg.version);
    });

    it("requires the pf2e system", () => {
        expect(manifest.relationships.systems.map((s) => s.id)).toContain("pf2e");
    });

    it("targets Foundry v14", () => {
        expect(manifest.compatibility.maximum).toBe("14");
    });
});
