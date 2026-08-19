import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const profiles = [
  { name: "iPhone 12", portrait: [390, 844], landscape: [844, 390] },
  { name: "Galaxy S26 Ultra standard scaling", portrait: [412, 891], landscape: [891, 412] },
  { name: "Galaxy S26 Ultra compact scaling", portrait: [480, 1040], landscape: [1040, 480] },
  { name: "Galaxy Tab S9 standard scaling", portrait: [800, 1280], landscape: [1280, 800] },
  { name: "Galaxy Tab S9 enlarged scaling", portrait: [753, 1205], landscape: [1205, 753] },
] as const;

describe("target-device responsive contract", () => {
  test("covers every target profile with phone, tablet, or landscape rules", () => {
    for (const profile of profiles) {
      const [portraitWidth] = profile.portrait;
      const [, landscapeHeight] = profile.landscape;
      expect(portraitWidth <= 600 || portraitWidth <= 980).toBe(true);
      expect(landscapeHeight <= 520 || profile.landscape[0] >= 981).toBe(true);
    }
  });

  test("keeps mobile browser chrome and display cutouts out of controls", async () => {
    const [css, html] = await Promise.all([
      readFile(new URL("../../src/styles.css", import.meta.url), "utf8"),
      readFile(new URL("../../index.html", import.meta.url), "utf8"),
    ]);

    expect(html).toContain("viewport-fit=cover");
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(css).toContain(`env(safe-area-inset-${edge})`);
    }
    expect(css).toContain("100svh");
    expect(css).toContain("100dvh");
    expect(css).not.toContain("100vw");
  });

  test("retains coarse-pointer targets and exact device-range breakpoints", async () => {
    const css = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

    expect(css).toContain("@media (max-width: 600px)");
    expect(css).toContain("@media (max-width: 980px)");
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain("@media (orientation: landscape) and (max-height: 520px) and (max-width: 1100px)");
    expect(css).toMatch(/\.question-grid button\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.question-footer \.button\s*\{[^}]*min-height:\s*48px/);
  });
});
