import { defineConfig } from "vitest/config";

// Unit tests cover the pure-logic modules only (no Foundry globals), so they run in plain Node.
export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
});
