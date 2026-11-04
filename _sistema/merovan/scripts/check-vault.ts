// Usage: npm run vault:check [-- <vault path>]   (default: the vault that contains _sistema/)
import { resolve } from "node:path";
import { checkVault, reportMarkdown } from "../src/lib/obsidian/check";

const root = resolve(process.argv[2] ?? process.env.VAULT_PATH ?? "../..");
const report = checkVault(root);
console.log(reportMarkdown(report, new Date().toISOString().slice(0, 16).replace("T", " ")));
process.exit(report.errors.length ? 1 : 0);
