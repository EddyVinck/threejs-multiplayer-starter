import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_AUTH_PATTERNS,
  MAX_CLIENT_JS_TOTAL_BYTES,
  MAX_INDEX_HTML_BYTES,
  scanClientSourceForAuthStrings,
  validateAssetSizes,
  validateClientIndexHtml
} from "./jam-constraints.mjs";

const clientSrcDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/client/src"
);

describe("validateClientIndexHtml", () => {
  it("accepts minimal Vite-style shell", () => {
    const html = `<!doctype html><html><body><div id="app"></div></body></html>`;
    expect(validateClientIndexHtml(html)).toEqual([]);
  });

  it("rejects oversized HTML", () => {
    const pad = "x".repeat(MAX_INDEX_HTML_BYTES);
    const html = `<!doctype html><html><body><div id="app">${pad}</div></body></html>`;
    const err = validateClientIndexHtml(html);
    expect(err.length).toBe(1);
    expect(err[0]).toMatch(/exceeds/);
  });

  it("rejects missing app root", () => {
    const html = `<!doctype html><html><body></body></html>`;
    expect(
      validateClientIndexHtml(html).some((e) => e.includes("id=\"app\""))
    ).toBe(true);
  });

  it("rejects splash-style copy in HTML", () => {
    const html = `<!doctype html><html><body><div id="app"><div class="splash">Hi</div></div></body></html>`;
    expect(validateClientIndexHtml(html).length).toBeGreaterThan(0);
  });
});

describe("FORBIDDEN_AUTH_PATTERNS", () => {
  it("has non-overlapping coverage labels for debugging", () => {
    const names = FORBIDDEN_AUTH_PATTERNS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("validateAssetSizes", () => {
  it("passes for tiny assets and fails when JS total exceeds budget", () => {
    const dir = mkdtempSync(join(tmpdir(), "jam-assets-"));
    try {
      writeFileSync(join(dir, "a.js"), "x".repeat(100));
      writeFileSync(join(dir, "b.wasm"), Buffer.alloc(100));
      expect(validateAssetSizes(dir)).toEqual([]);

      writeFileSync(join(dir, "c.js"), "y".repeat(MAX_CLIENT_JS_TOTAL_BYTES));
      const big = validateAssetSizes(dir);
      expect(big.length).toBe(1);
      expect(big[0]).toMatch(/exceeds budget/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scanClientSourceForAuthStrings", () => {
  it("returns no errors for the real client tree", () => {
    expect(scanClientSourceForAuthStrings(clientSrcDir)).toEqual([]);
  });
});
