import { describe, expect, it } from "vitest";

import { FOCUS_MAX_LENGTH, QUERY_MAX_LENGTH, parseResearchInput } from "./research-input";

describe("parseResearchInput", () => {
  it("accepts a question and trims and collapses whitespace", () => {
    expect(
      parseResearchInput({ query: "  Cybersecurity   startups\nin Europe ", focus: " trends " }),
    ).toEqual({ ok: true, value: { query: "Cybersecurity startups in Europe", focus: "trends" } });
  });

  it("stores an empty or whitespace-only focus as null", () => {
    for (const focus of ["", "   ", null, undefined]) {
      const result = parseResearchInput({ query: "Fintech in Brazil", focus });
      expect(result).toEqual({ ok: true, value: { query: "Fintech in Brazil", focus: null } });
    }
  });

  it("rejects missing, non-string and too-short questions", () => {
    for (const query of [undefined, null, 42, "", "   ", "ab", "\n a \n\t"]) {
      const result = parseResearchInput({ query, focus: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.query).toBeDefined();
    }
  });

  it("enforces the maximum lengths at the boundary", () => {
    const at = "q".repeat(QUERY_MAX_LENGTH);
    expect(parseResearchInput({ query: at, focus: "f".repeat(FOCUS_MAX_LENGTH) }).ok).toBe(true);

    const over = parseResearchInput({ query: at + "q", focus: "f".repeat(FOCUS_MAX_LENGTH + 1) });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.errors.query).toBeDefined();
      expect(over.errors.focus).toBeDefined();
    }
  });

  it("counts code points like Postgres, not UTF-16 units", () => {
    // Each emoji is 1 code point but 2 UTF-16 units: 500 of them must pass.
    expect(parseResearchInput({ query: "🔒".repeat(QUERY_MAX_LENGTH), focus: "" }).ok).toBe(true);
    // 3 code points is the minimum even though it is 6 UTF-16 units.
    expect(parseResearchInput({ query: "🔒🔒🔒", focus: "" }).ok).toBe(true);
  });
});
