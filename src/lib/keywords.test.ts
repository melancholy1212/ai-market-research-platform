import { describe, expect, it } from "vitest";

import { searchKeywords } from "./keywords";

describe("searchKeywords", () => {
  it("keeps the meaningful terms of a question", () => {
    expect(searchKeywords("Research cybersecurity startups in Europe")).toBe("cybersecurity startups europe");
    expect(
      searchKeywords("Research cybersecurity startups in Europe. Identify the major companies, recent developments"),
    ).toBe("cybersecurity startups europe");
  });

  it("caps the number of terms and drops duplicates", () => {
    expect(searchKeywords("fintech fintech lending payments banking", 3)).toBe("fintech lending payments");
  });

  it("keeps hyphenated and non-English terms", () => {
    expect(searchKeywords("e-commerce in Deutschland")).toBe("e-commerce deutschland");
  });

  it("returns null when nothing usable is left", () => {
    expect(searchKeywords("the top AI in EU")).toBeNull();
    expect(searchKeywords("")).toBeNull();
  });
});
