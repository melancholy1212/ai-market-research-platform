import { describe, expect, it } from "vitest";

import { countriesMentioned, findPlaces, mentionsPhrase, placePhrases } from "./geo";

describe("mentionsPhrase", () => {
  it("matches whole words, case-insensitively for longer phrases", () => {
    expect(mentionsPhrase("Munich-based Helsing raised", "munich")).toBe(true);
    expect(mentionsPhrase("Germanys", "germany")).toBe(false);
    expect(mentionsPhrase("an Indian fintech", "indian")).toBe(true);
  });
  it("requires capitals for short phrases so pronouns do not count", () => {
    expect(mentionsPhrase("Contact us for a demo", "us")).toBe(false);
    expect(mentionsPhrase("the US market", "us")).toBe(true);
    expect(mentionsPhrase("EU regulators", "eu")).toBe(true);
    expect(mentionsPhrase("the eu-startups site", "eu")).toBe(false);
  });
});

describe("placePhrases / findPlaces", () => {
  it("expands a country to demonyms and cities, and a region to its countries", () => {
    expect(placePhrases("Germany")).toEqual(expect.arrayContaining(["germany", "german", "berlin", "munich"]));
    expect(placePhrases("Europe")).toEqual(expect.arrayContaining(["european", "germany", "french", "paris"]));
    expect(placePhrases("UK")).toEqual(expect.arrayContaining(["united kingdom", "british", "london"]));
  });
  it("finds places named in a research question", () => {
    expect(findPlaces("Fintech startups in India")).toEqual(["india"]);
    expect(findPlaces("Cybersecurity startups in Europe")).toEqual(["europe"]);
    expect(findPlaces("AI startups in the US")).toEqual(["united states"]);
    expect(findPlaces("Tell us about robotics")).toEqual([]);
  });
});

describe("countriesMentioned", () => {
  it("reads a country off a demonym or city, unlike findPlaces", () => {
    expect(countriesMentioned("Tokyo-based GITAI raised a new round")).toEqual(["japan"]);
    expect(findPlaces("Tokyo-based GITAI raised a new round")).toEqual([]);
    expect(countriesMentioned("The Indian fintech expanded")).toEqual(["india"]);
  });
  it("returns every country mentioned, so callers can require exactly one", () => {
    expect(countriesMentioned("The Tokyo firm opened a Los Angeles office")).toEqual(
      expect.arrayContaining(["japan", "united states"]),
    );
  });
  it("finds nothing when no known place is mentioned", () => {
    expect(countriesMentioned("A new robotics platform launched")).toEqual([]);
  });
});
