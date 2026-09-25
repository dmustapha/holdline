/**
 * Design teeth — machine verdicts for the Night Watch design system (Stage 4.5).
 * Three principles, each an un-dismissable test:
 *   1. token-drift        — shipped globals.css :root == brand.json / DESIGN_SYSTEM truth
 *   2. forbidden-defaults — no Space Grotesk, no Inter-as-display, no generic AI defaults
 *   3. contrast ≥4.5:1    — every text token clears WCAG AA on the surface it is used on
 * Run: npm run test:teeth
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..");
const css = readFileSync(join(APP, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(APP, "src/app/layout.tsx"), "utf8");
const brand = JSON.parse(readFileSync(join(APP, "brand.json"), "utf8"));

/** pull `--token: value;` out of the :root block */
function cssVar(name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1].trim().toLowerCase();
}

// ---------- WCAG relative luminance + contrast ----------
function srgbToLin(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("token-drift — shipped :root is the single source of truth", () => {
  it("brand.json colors match the shipped globals.css :root", () => {
    expect(cssVar("moon")).toBe(brand.brandColor.toLowerCase());
    expect(cssVar("bg-base")).toBe(brand.ink[0].toLowerCase());
    expect(cssVar("surface-1")).toBe(brand.ink[1].toLowerCase());
    expect(cssVar("surface-2")).toBe(brand.ink[2].toLowerCase());
    expect(cssVar("surface-3")).toBe(brand.ink[3].toLowerCase());
    expect(cssVar("text-hi")).toBe(brand.ink[4].toLowerCase());
    expect(cssVar("safe")).toBe(brand.semantic.success.toLowerCase());
    expect(cssVar("warn")).toBe(brand.semantic.warning.toLowerCase());
    expect(cssVar("danger")).toBe(brand.semantic.danger.toLowerCase());
  });
  it("the --amber alias still resolves to the single moon brand hue (no second warm hue)", () => {
    expect(cssVar("amber")).toBe(cssVar("moon"));
  });
  it("radius scale matches brand.json", () => {
    expect(cssVar("radius-sm")).toBe(`${brand.radii.sm}px`);
    expect(cssVar("radius-md")).toBe(`${brand.radii.md}px`);
    expect(cssVar("radius-lg")).toBe(`${brand.radii.lg}px`);
    expect(cssVar("radius-xl")).toBe(`${brand.radii.xl}px`);
  });
});

describe("forbidden-defaults — no generic AI/system display fonts", () => {
  const banned = ["Space Grotesk", "Inter"];
  it("globals.css declares no banned display fonts", () => {
    for (const f of banned) expect(css).not.toContain(f);
  });
  it("layout.tsx loads no banned display fonts", () => {
    for (const f of banned) expect(layout).not.toContain(f);
  });
  it("the chosen display + body fonts are the meaning-driven pair", () => {
    expect(layout).toContain("Fraunces");
    expect(layout).toContain("Familjen_Grotesk");
    expect(brand.fonts.display).toBe("Fraunces");
    expect(brand.fonts.body).toBe("Familjen Grotesk");
  });
});

describe("contrast — every text token clears WCAG AA 4.5:1 on its surface", () => {
  const surfaces = [
    ["bg-base", cssVar("bg-base")],
    ["surface-1", cssVar("surface-1")],
    ["surface-2", cssVar("surface-2")],
    ["surface-3", cssVar("surface-3")],
  ] as const;
  const textTokens = ["text-hi", "text-mid", "text-low", "moon", "safe", "warn", "danger"];

  for (const t of textTokens) {
    const fg = cssVar(t);
    for (const [sName, sHex] of surfaces) {
      it(`--${t} on --${sName} ≥ 4.5:1`, () => {
        const ratio = contrast(fg, sHex);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
