import { describe, expect, it } from "vitest";

import { displayRelevance } from "./relevance-label";

describe("displayRelevance", () => {
  it("uses the stored label for classified sources", () => {
    expect(displayRelevance({ relevance_label: "direct", is_relevant: true })).toBe("direct");
    expect(displayRelevance({ relevance_label: "contextual", is_relevant: true })).toBe("contextual");
    expect(displayRelevance({ relevance_label: "irrelevant", is_relevant: false })).toBe("irrelevant");
  });

  it("never shows a legacy source without a label as direct", () => {
    expect(displayRelevance({ relevance_label: null, is_relevant: null })).toBe("unclassified");
    expect(displayRelevance({ relevance_label: null, is_relevant: true })).toBe("unclassified");
  });

  it("keeps legacy sources the keyword filter set aside as filtered out", () => {
    expect(displayRelevance({ relevance_label: null, is_relevant: false })).toBe("irrelevant");
  });
});
