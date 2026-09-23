import { describe, expect, it } from "vitest";

import { groupStories, matchStories, titleTokens } from "./dedup";

const d = (day: number) => `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`;
const s = (title: string | null, publishedAt: string | null = null) => ({ title, publishedAt });
const query = titleTokens("Cybersecurity startups in Europe");

describe("titleTokens", () => {
  it("unifies money amounts, case, accents and plurals", () => {
    expect(titleTokens("Hackuity lands €16 million")).toEqual(titleTokens("HACKUITY lands €16M"));
    expect(titleTokens("Pérez raises $1.5bn")).toEqual(new Set(["perez", "raise", "1.5b"]));
    expect(titleTokens("Startups and startup")).toEqual(new Set(["startup"]));
  });
});

describe("matchStories", () => {
  it("matches the same headline syndicated by another outlet", () => {
    const m = matchStories(
      s("Exein reaches unicorn status as it raises €200 million", d(15)),
      s("Exein reaches unicorn status as it raises €200M", d(16)),
      query,
    );
    expect(m?.reason).toBe("same_title");
  });

  it("matches a longer rewrite of a dated headline", () => {
    const m = matchStories(
      s("Hackuity lands €16 million to tackle vulnerability overload", d(16)),
      s("France’s Hackuity lands €16M to tackle the vulnerability overload in enterprises", d(16)),
      query,
    );
    expect(m).not.toBeNull();
  });

  it("does not merge recurring editions with the same title a week apart", () => {
    expect(
      matchStories(
        s("Weekly funding round-up! All of the European startup funding rounds we tracked this week", d(10)),
        s("Weekly funding round-up! All of the European startup funding rounds we tracked this week", d(18)),
        query,
      ),
    ).toBeNull();
  });

  it("does not merge similar listicles from different sites when dates are unknown", () => {
    expect(
      matchStories(s("Top 10 Cybersecurity Companies in Europe"), s("Top Cybersecurity Companies in Europe: 25 Scored (2026)"), query),
    ).toBeNull();
  });

  it("ignores words from the research question itself", () => {
    // Shares only query words: cybersecurity, startup, europe.
    expect(
      matchStories(s("Cybersecurity startups in Europe raise record funding", d(1)), s("Europe cybersecurity startups face hiring crunch", d(1)), query),
    ).toBeNull();
  });

  it("does not merge different stories about the same company", () => {
    expect(
      matchStories(
        s("Secfix raises $12M Series A to build security compliance platform", d(2)),
        s("Secfix opens Berlin office and hires new CTO", d(3)),
        query,
      ),
    ).toBeNull();
  });

  it("needs titles on both sides", () => {
    expect(matchStories(s(null, d(1)), s("Anything at all here", d(1)))).toBeNull();
  });
});

describe("groupStories", () => {
  it("groups duplicates under the first source and keeps the rest separate", () => {
    const sources = [
      { id: 1, ...s("Exein reaches unicorn status as it raises €200 million", d(15)) },
      { id: 2, ...s("Secfix raises $12M Series A for security compliance", d(15)) },
      { id: 3, ...s("Exein reaches unicorn status as it raises €200M", d(16)) },
    ];
    const groups = groupStories(sources, query);
    expect(groups.map((g) => [g.primary.id, ...g.duplicates.map((x) => x.source.id)])).toEqual([[1, 3], [2]]);
  });

  it("does not chain: C joins only if it matches the primary directly", () => {
    const a = { id: "a", ...s("Acme Security raises $10M seed round led by Index", d(1)) };
    const b = { id: "b", ...s("Acme Security raises $10M seed round led by Index Ventures to expand in Germany", d(1)) };
    const c = { id: "c", ...s("Index Ventures to expand in Germany with new Berlin team", d(1)) };
    expect(matchStories(a, b)).not.toBeNull();
    expect(matchStories(a, c)).toBeNull();
    const groups = groupStories([a, b, c]);
    expect(groups.map((g) => g.primary.id)).toEqual(["a", "c"]);
  });
});

describe("matchStories: shared figure and subject", () => {
  const exeinQuery = titleTokens("Exein unicorn funding round");

  it("matches rewritten headlines that share the amount and the company", () => {
    expect(
      matchStories(
        s("Exein, A Startup from Rome, Raises $270 Million and Becomes a Physical AI Unicorn", d(15)),
        s("Italy’s Exein hits unicorn status with $270m fundraising round", d(15)),
        exeinQuery,
      ),
    ).toEqual({ similarity: 1, reason: "same_figure" });
  });

  it("does not match different companies raising the same amount", () => {
    expect(
      matchStories(s("Berlin startup Acme raises $10M seed round", d(1)), s("Paris startup Zeta raises $10M seed round", d(2)), query),
    ).toBeNull();
  });

  it("does not match the same figure far apart in time", () => {
    expect(matchStories(s("Exein raises $270M", d(1)), s("Exein raises $270M", d(9)), exeinQuery)).toBeNull();
  });

  it("does not use the figure rule when a date is missing", () => {
    expect(matchStories(s("Exein raises $270M from Balderton", d(1)), s("Exein raises $270M after growth", null), exeinQuery)).toBeNull();
  });
});

describe("groupStories: bridging by figure", () => {
  it("joins headlines with different figures through a member stating both", () => {
    const q = titleTokens("Exein unicorn funding round");
    const groups = groupStories(
      [
        { id: 1, ...s("Exein raises $270 Million and becomes a Physical AI unicorn", d(15)) },
        { id: 2, ...s("Exein secures a $270 million round and is valued at $1.7 billion", d(15)) },
        { id: 3, ...s("Italian firm Exein becomes a unicorn: valued at $1.7 billion", d(15)) },
      ],
      q,
    );
    expect(groups.map((g) => [g.primary.id, ...g.duplicates.map((x) => x.source.id)])).toEqual([[1, 2, 3]]);
  });
});
