/**
 * Automated jam-constraint checks: minimal HTML, bundle budgets, no auth UX strings in client source.
 * Run after `pnpm build` to include dist asset budgets; HTML + source checks always run.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** @typedef {{ re: RegExp; name: string }} ForbiddenPattern */

/** @type {ForbiddenPattern[]} */
export const FORBIDDEN_AUTH_PATTERNS = [
  { re: /\blogin\b/i, name: "login" },
  { re: /\bsignup\b/i, name: "signup" },
  { re: /\bsign[\s-]?up\b/i, name: "sign up" },
  { re: /\bsign[\s-]?in\b/i, name: "sign in" },
  { re: /\blog[\s-]?in\b/i, name: "log in" },
  { re: /\bpassword\b/i, name: "password" },
  { re: /\bauthenticate\b/i, name: "authenticate" },
  { re: /\boauth\b/i, name: "oauth" }
];

/** Keep shell HTML tiny so first paint stays parser-light. */
export const MAX_INDEX_HTML_BYTES = 4096;

/** Sum of all emitted *.js under dist/assets (single chunk today; room for small splits). */
export const MAX_CLIENT_JS_TOTAL_BYTES = 1_400_000;

/** Rapier WASM dominates first load; cap catches accidental engine swaps. */
export const MAX_CLIENT_WASM_BYTES = 2_300_000;

/**
 * @param {string} html
 * @param {{ label?: string }} [options]
 * @returns {string[]}
 */
export function validateClientIndexHtml(html, options = {}) {
  const label = options.label ?? "index.html";
  const errors = [];
  if (Buffer.byteLength(html, "utf8") > MAX_INDEX_HTML_BYTES) {
    errors.push(
      `${label}: exceeds ${MAX_INDEX_HTML_BYTES} bytes (keep HTML minimal for fast parse)`
    );
  }
  if (!/id=["']app["']/.test(html)) {
    errors.push(`${label}: expected a root element with id="app"`);
  }
  if (/\b(splash|spinner|loading-screen|please\s+wait)\b/i.test(html)) {
    errors.push(`${label}: avoid blocking splash or loading screens in HTML`);
  }
  return errors;
}

/**
 * @param {string} assetsDir
 * @returns {string[]}
 */
export function validateAssetSizes(assetsDir) {
  const errors = [];
  let jsTotal = 0;
  let wasmMax = 0;
  let wasmFile = "";
  const names = readdirSync(assetsDir);
  for (const name of names) {
    if (!name.endsWith(".js") && !name.endsWith(".wasm")) continue;
    const p = join(assetsDir, name);
    const st = statSync(p);
    if (name.endsWith(".js")) jsTotal += st.size;
    if (name.endsWith(".wasm") && st.size > wasmMax) {
      wasmMax = st.size;
      wasmFile = name;
    }
  }
  if (jsTotal > MAX_CLIENT_JS_TOTAL_BYTES) {
    errors.push(
      `client JS total ${jsTotal} bytes exceeds budget ${MAX_CLIENT_JS_TOTAL_BYTES} (${assetsDir})`
    );
  }
  if (wasmMax > MAX_CLIENT_WASM_BYTES) {
    errors.push(
      `client WASM ${wasmFile} (${wasmMax} bytes) exceeds budget ${MAX_CLIENT_WASM_BYTES}`
    );
  }
  return errors;
}

/**
 * @param {string} dir
 * @param {(name: string, path: string) => void} visitFile
 */
function walkTsFiles(dir, visitFile) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, visitFile);
    else if (ent.isFile() && ent.name.endsWith(".ts")) visitFile(ent.name, p);
  }
}

/**
 * @param {string} clientSrcDir
 * @returns {string[]}
 */
export function scanClientSourceForAuthStrings(clientSrcDir) {
  const errors = [];
  walkTsFiles(clientSrcDir, (_name, filePath) => {
    const text = readFileSync(filePath, "utf8");
    for (const { re, name } of FORBIDDEN_AUTH_PATTERNS) {
      if (re.test(text)) {
        errors.push(
          `${filePath}: forbidden auth-related term "${name}" in client source`
        );
      }
    }
  });
  return errors;
}
