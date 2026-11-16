import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import i18n, {
  tr,
  errorText,
  normalizeDigits,
  currentLanguage,
  loadLanguageCatalog,
} from "../src/lib/i18n";
import { LANGUAGES } from "../src/lib/languages";
import { factoryDate } from "../src/domain/rules";
const directory = new URL("../src/locales/", import.meta.url);
const en = JSON.parse(
  readFileSync(new URL("en.json", directory), "utf8"),
) as Record<string, string>;
const placeholders = (text: string) =>
  [...text.matchAll(/{{[^}]+}}/g)].map((m) => m[0]).sort();
afterEach(() => i18n.changeLanguage("en"));
describe("offline language catalogs", () => {
  it("provides complete catalogs and intact substitutions for every selectable language", () => {
    expect(LANGUAGES).toHaveLength(23);
    expect(
      readdirSync(directory).filter((f) => f.endsWith(".json")),
    ).toHaveLength(23);
    for (const language of LANGUAGES) {
      const catalog = JSON.parse(
        readFileSync(new URL(language.code + ".json", directory), "utf8"),
      ) as Record<string, string>;
      for (const [key, value] of Object.entries(en)) {
        expect(catalog[key], language.code + ": " + key).toBeTruthy();
        expect(placeholders(catalog[key]), language.code + ": " + key).toEqual(
          placeholders(value),
        );
        expect(catalog[key], language.code + ": " + key).not.toMatch(
          /[⟦⟧【】]|QZX|crewgrainvalue\d@example|\ufffd/,
        );
        if (!value.includes("\n"))
          expect(catalog[key], language.code + ": " + key).not.toContain("\n");
      }
    }
  });
  it("changes full phrases, keeps rendered notifications and leaves stored dates unchanged", async () => {
    for (const language of LANGUAGES) {
      loadLanguageCatalog(language.code);
      await i18n.changeLanguage(language.code);
      expect(currentLanguage().code).toBe(language.code);
      expect(factoryDate(new Date("2026-11-10T02:00:00Z"))).toBe("2026-11-10");
      const message = tr("Operations saved.");
      expect(errorText(message)).toBe(message);
      expect(tr("Operations")).not.toContain("{{");
    }
  });
  it("normalizes entered quantities and IDs from Indian and Arabic digit scripts", () => {
    expect(normalizeDigits("०१२३४५६७८९")).toBe("0123456789");
    expect(normalizeDigits("০১২৩৪৫৬৭৮৯")).toBe("0123456789");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("ZV-०४१")).toBe("ZV-041");
  });
});
