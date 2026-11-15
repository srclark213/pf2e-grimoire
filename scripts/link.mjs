// Links dist/ into a local Foundry install as Data/modules/pf2e-grimoire.
//
// Usage: npm run link -- [path-to-Foundry-Data]
// The Data path is looked up in this order:
//   1. the command-line argument (saved to foundry.config.json for next time)
//   2. the FOUNDRY_DATA environment variable
//   3. foundry.config.json { "dataPath": "..." } (gitignored)
//   4. the Windows default, %LOCALAPPDATA%/FoundryVTT/Data
// On Windows a directory junction is used, so no admin rights or Developer Mode are needed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_ID = "pf2e-grimoire";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(root, "foundry.config.json");
const dist = path.join(root, "dist");

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch {
        return {};
    }
}

function resolveDataPath() {
    const arg = process.argv[2];
    if (arg) {
        fs.writeFileSync(configFile, JSON.stringify({ ...readConfig(), dataPath: arg }, null, 4) + "\n");
        return arg;
    }
    if (process.env.FOUNDRY_DATA) return process.env.FOUNDRY_DATA;
    const configured = readConfig().dataPath;
    if (configured) return configured;
    if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, "FoundryVTT", "Data");
    return null;
}

function fail(message) {
    console.error(`link: ${message}`);
    process.exit(1);
}

const dataPath = resolveDataPath();
if (!dataPath) fail("no Foundry Data path. Pass one: npm run link -- <path-to-Foundry-Data>");

const modulesDir = path.join(path.resolve(dataPath), "modules");
if (!fs.existsSync(modulesDir)) fail(`${modulesDir} does not exist. Is ${dataPath} the Foundry Data folder?`);

const linkPath = path.join(modulesDir, MODULE_ID);
fs.mkdirSync(dist, { recursive: true });

const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false });
if (existing) {
    if (!existing.isSymbolicLink()) {
        fail(`${linkPath} already exists and is a real folder, not a link. Move or delete it first.`);
    }
    const current = path.resolve(modulesDir, fs.readlinkSync(linkPath));
    if (current === dist) {
        console.log(`link: already linked ${linkPath} -> ${dist}`);
        process.exit(0);
    }
    fs.unlinkSync(linkPath);
}

fs.symlinkSync(dist, linkPath, process.platform === "win32" ? "junction" : "dir");
console.log(`link: ${linkPath} -> ${dist}`);
