#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanClientSourceForAuthStrings,
  validateAssetSizes,
  validateClientIndexHtml
} from "./jam-constraints.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const errors = [];

errors.push(
  ...validateClientIndexHtml(
    readFileSync(join(root, "packages/client/index.html"), "utf8"),
    { label: "packages/client/index.html" }
  )
);

const distHtml = join(root, "packages/client/dist/index.html");
if (existsSync(distHtml)) {
  errors.push(
    ...validateClientIndexHtml(readFileSync(distHtml, "utf8"), {
      label: "packages/client/dist/index.html"
    })
  );
}

const distAssets = join(root, "packages/client/dist/assets");
if (existsSync(distAssets)) {
  errors.push(...validateAssetSizes(distAssets));
}

errors.push(
  ...scanClientSourceForAuthStrings(join(root, "packages/client/src"))
);

if (errors.length > 0) {
  for (const line of errors) {
    console.error(`jam-constraints: ${line}`);
  }
  process.exit(1);
}

console.log("jam-constraints: OK (HTML, optional dist budgets, client source scan)");
