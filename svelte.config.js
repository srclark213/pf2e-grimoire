import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
    // The loadPaths entry lets svelte-check preprocess pf2e's own components, which import "src/styles/…".
    preprocess: vitePreprocess({
        style: { css: { preprocessorOptions: { scss: { loadPaths: ["vendor/pf2e"] } } } },
    }),
    compilerOptions: {
        runes: true,
    },
};
