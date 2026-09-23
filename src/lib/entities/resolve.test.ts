import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/wikidata-entities.json";
import { parseWikidataEntities, resolveCompany, type CompanyToResolve } from "./resolve";

// Real Wikidata records (trimmed): two "CRED"s, a Danish "XFlow", Darktrace,
// Cashfree Payments and a Hungarian "NAVI".
const entities = parseWikidataEntities(fixture);
const byId = new Map(entities.map((e) => [e.id, e]));
const pick = (...ids: string[]) => ids.map((id) => byId.get(id)!);
const countries = new Map([
  ["Q668", "India"], ["Q30", "United States"], ["Q35", "Denmark"], ["Q145", "United Kingdom"], ["Q28", "Hungary"],
]);
const company = (over: Partial<CompanyToResolve>): CompanyToResolve => ({ name: "", country: null, focus: null, domain: null, ...over });
const INDIA_FINTECH = "Fintech startups in India";

describe("parseWikidataEntities", () => {
  it("extracts label, description, classes, country and website", () => {
    expect(byId.get("Q106455641")).toMatchObject({
      label: "CRED",
      description: "Indian financial services company",
      instanceOf: ["Q4830453"],
      countryIds: ["Q668"],
      websites: ["https://cred.club/"],
    });
  });
  it("skips missing entities", () => {
    expect(parseWikidataEntities({ entities: { Q1: { id: "Q1", missing: "" } } })).toEqual([]);
  });
});

describe("resolveCompany", () => {
  it("resolves CRED in India and ignores the same-named US company", () => {
    const r = resolveCompany(company({ name: "CRED", country: "India", focus: "Consumer credit and rewards platform" }), pick("Q106455641", "Q135209797"), countries, INDIA_FINTECH);
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.match.entity.id).toBe("Q106455641");
      expect(r.match.signals).toContain("country matches");
    }
  });

  it("does not merge Indian Xflow with Danish XFlow", () => {
    const r = resolveCompany(company({ name: "Xflow", country: "India", focus: "Cross-border B2B payments" }), pick("Q134963253"), countries, INDIA_FINTECH);
    expect(r).toEqual({ status: "unresolved", reason: "no candidate matched" });
  });

  it("does not match a Hungarian NAVI for an Indian Navi", () => {
    const r = resolveCompany(company({ name: "Navi", country: "India" }), pick("Q102324384"), countries, INDIA_FINTECH);
    expect(r.status).toBe("unresolved");
  });

  it("uses the website from the sources as the strongest signal", () => {
    const r = resolveCompany(company({ name: "Darktrace", domain: "darktrace.com" }), pick("Q27907429"), countries, "Cybersecurity startups in Europe");
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.match.signals).toContain("website matches sources");
  });

  it("counts a different official website against the candidate", () => {
    const r = resolveCompany(company({ name: "Darktrace", domain: "darktrace-fake.io" }), pick("Q27907429"), countries, "Cybersecurity startups in Europe");
    expect(r.status).toBe("unresolved");
  });

  it("uses the research's country as weak evidence when the sources give none", () => {
    const r = resolveCompany(company({ name: "Cashfree Payments", focus: "payments" }), pick("Q134715663"), countries, INDIA_FINTECH);
    expect(r.status).toBe("resolved");
  });

  it("stays unresolved on a bare name match with no other evidence", () => {
    const r = resolveCompany(company({ name: "NAVI" }), pick("Q102324384"), countries, "Robotics in Japan");
    expect(r).toEqual({ status: "unresolved", reason: "not enough evidence" });
  });

  it("reports ambiguity when two candidates are equally good", () => {
    const twin = { ...byId.get("Q106455641")!, id: "Q999", websites: [] };
    const r = resolveCompany(company({ name: "CRED", country: "India" }), [byId.get("Q106455641")!, twin], countries, INDIA_FINTECH);
    expect(r.status).toBe("ambiguous");
  });
});
