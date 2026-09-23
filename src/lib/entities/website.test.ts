import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/clearbit-suggest.json";
import { pickOfficialDomain, pickSuggestedDomain, type NameDomain } from "./website";

// Real Clearbit Autocomplete responses for companies from research runs.
const suggest = (name: keyof typeof fixture) => fixture[name] as NameDomain[];

describe("pickSuggestedDomain", () => {
  it("picks the exact-name company among look-alikes", () => {
    expect(pickSuggestedDomain(suggest("Parloa"), "Parloa", "Germany")).toBe("parloa.com");
    expect(pickSuggestedDomain(suggest("Exein"), "Exein", "Italy")).toBe("exein.io");
    expect(pickSuggestedDomain(suggest("Orbem"), "Orbem", "Germany")).toBe("orbem.ai");
  });

  it("drops a same-named company's site in another country", () => {
    // clinomic.in (India) vs clinomic.ai for a German company.
    expect(pickSuggestedDomain(suggest("Clinomic"), "Clinomic", "Germany")).toBe("clinomic.ai");
    // perfios.com.br (Brazil) vs perfios.com for an Indian company.
    expect(pickSuggestedDomain(suggest("Perfios"), "Perfios", "India")).toBe("perfios.com");
    // The only exact "ATIRA" is atira.in: not a German company's site.
    expect(pickSuggestedDomain(suggest("Atira"), "Atira", "Germany")).toBeNull();
  });

  it("returns nothing when only differently named companies come back", () => {
    expect(pickSuggestedDomain(suggest("Navi"), "Navi", "India")).toBeNull();
    expect(pickSuggestedDomain(suggest("Xflow"), "Xflow", "India")).toBeNull();
  });

  it("treats remaining different domains as ambiguous unless one is local", () => {
    const two = [
      { name: "Acme", domain: "acme.com" },
      { name: "Acme", domain: "acme.io" },
    ];
    expect(pickSuggestedDomain(two, "Acme", "Germany")).toBeNull();
    expect(pickSuggestedDomain([...two, { name: "Acme", domain: "acme.de" }].slice(1), "Acme", "Germany")).toBe("acme.de");
  });

  it("ignores corporate suffixes when comparing names", () => {
    expect(pickSuggestedDomain([{ name: "Secfix GmbH", domain: "secfix.com" }], "Secfix", "Germany")).toBe("secfix.com");
  });
});

describe("pickOfficialDomain", () => {
  it("skips aggregators and returns the domain that matches the name", () => {
    expect(
      pickOfficialDomain(["https://en.wikipedia.org/wiki/Cred_(company)", "https://www.linkedin.com/company/cred-club", "https://cred.club/"], "CRED"),
    ).toBe("cred.club");
  });
  it("returns nothing rather than guessing", () => {
    expect(pickOfficialDomain(["https://en.wikipedia.org/wiki/X", "https://some-blog.com/cred-review"], "CRED")).toBeNull();
  });
});
