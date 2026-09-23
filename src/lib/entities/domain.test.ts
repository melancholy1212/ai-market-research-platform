import { describe, expect, it } from "vitest";

import { domainMatchesName, registrableDomain } from "./domain";

describe("registrableDomain", () => {
  it("reduces hosts and URLs to the registrable domain", () => {
    expect(registrableDomain("https://app.navi.com/login")).toBe("navi.com");
    expect(registrableDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("cred.club")).toBe("cred.club");
    expect(registrableDomain("shop.brand.com.au")).toBe("brand.com.au");
  });
  it("rejects things that are not domains", () => {
    expect(registrableDomain("localhost")).toBeNull();
    expect(registrableDomain("192.168.1.1")).toBeNull();
    expect(registrableDomain("")).toBeNull();
  });
});

describe("domainMatchesName", () => {
  it("matches official domains of real companies", () => {
    expect(domainMatchesName("cred.club", "CRED")).toBe(true);
    expect(domainMatchesName("www.recurclub.com", "Recur Club")).toBe(true);
    expect(domainMatchesName("cashfree.com", "Cashfree Payments")).toBe(true);
    expect(domainMatchesName("darktrace.com", "Darktrace")).toBe(true);
    expect(domainMatchesName("monsooncredittech.com", "Monsoon CreditTech")).toBe(true);
    expect(domainMatchesName("exein.io", "Exein S.p.A.")).toBe(true);
  });
  it("rejects aggregators and unrelated domains", () => {
    expect(domainMatchesName("wikipedia.org", "CRED")).toBe(false);
    expect(domainMatchesName("crunchbase.com", "Navi")).toBe(false);
    expect(domainMatchesName("credit-suisse.com", "Cred")).toBe(false);
    expect(domainMatchesName("ai.com", "AI Labs")).toBe(false);
    expect(domainMatchesName("navigate.com", "Navi")).toBe(false);
  });
  it("accepts common prefixes and suffixes around the name", () => {
    expect(domainMatchesName("getcred.com", "CRED")).toBe(true);
    expect(domainMatchesName("xflowpay.com", "Xflow")).toBe(true);
    expect(domainMatchesName("navi.com", "Navi Technologies")).toBe(true);
  });
});
