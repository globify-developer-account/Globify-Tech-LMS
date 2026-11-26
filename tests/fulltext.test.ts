import { describe, expect, it } from "vitest";
import { booleanFulltextQuery } from "@/lib/fulltext";

describe("booleanFulltextQuery", () => {
  it("requires every word and matches it as a prefix", () => {
    expect(booleanFulltextQuery("Marketing funnel")).toBe("+marketing* +funnel*");
  });

  it("strips boolean operators the person typed", () => {
    expect(booleanFulltextQuery('+react -"next" (hooks)* ~old')).toBe("+react* +next* +hooks* +old*");
  });

  it("drops short words and InnoDB stopwords, which would otherwise match nothing", () => {
    expect(booleanFulltextQuery("how to be a UI designer")).toBe("+designer*");
  });

  it("returns null when no searchable word is left", () => {
    expect(booleanFulltextQuery("to be")).toBeNull();
    expect(booleanFulltextQuery("   ")).toBeNull();
  });

  it("keeps Urdu words whole, including combining marks", () => {
    expect(booleanFulltextQuery("فری لانسنگ کورس")).toBe("+فری* +لانسنگ* +کورس*");
  });

  it("removes duplicates and caps the number of words", () => {
    expect(booleanFulltextQuery("seo seo seo")).toBe("+seo*");
    expect(booleanFulltextQuery("one two six ten red big", 3)).toBe("+one* +two* +six*");
  });
});
