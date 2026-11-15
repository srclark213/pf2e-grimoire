import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

/**
 * pf2e's source (vendor/pf2e) is in the repo for its types only. Vite resolves the tsconfig path aliases
 * (@actor, @item, ...), so a value import from pf2e would quietly bundle a second copy of the system.
 * Fail the build instead. At runtime, reach pf2e classes through globals such as CONFIG.PF2E or game.pf2e.
 */
function forbidPf2eRuntimeImports(): Plugin {
    return {
        name: "grimoire:forbid-pf2e-runtime-imports",
        enforce: "pre",
        load(id) {
            if (id.replaceAll("\\", "/").includes("/vendor/pf2e/")) {
                this.error(
                    `${id} is pf2e source and can't be bundled. Use "import type" for pf2e types, ` +
                        `and reach runtime classes through CONFIG/game.pf2e.`,
                );
            }
        },
    };
}

// Builds the module into dist/, which `npm run link` connects to Foundry's Data/modules/pf2e-grimoire.
// Files in static/ (module.json, lang/) are copied as-is.
export default defineConfig(({ mode }) => ({
    publicDir: "static",
    plugins: [forbidPf2eRuntimeImports(), svelte()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: mode === "development",
        minify: mode !== "development",
        target: "es2024",
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "grimoire.js",
            cssFileName: "grimoire",
        },
    },
}));
