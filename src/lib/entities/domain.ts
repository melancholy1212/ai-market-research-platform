import { displayHost } from "@/lib/url";

// Second-level labels under which organizations register (example.co.uk).
// Not the full Public Suffix List, but covers the markets this app sees.
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "org.au", "co.in", "net.in", "org.in", "firm.in",
  "com.br", "com.mx", "com.ar", "co.za", "com.ng", "co.ke", "com.eg", "com.sg", "com.my", "co.id",
  "co.jp", "co.kr", "com.cn", "com.hk", "com.tw", "co.nz", "com.tr", "co.il", "com.sa", "ae.org",
]);

// "app.navi.com" -> "navi.com", "www.example.co.uk" -> "example.co.uk".
export function registrableDomain(hostOrUrl: string): string | null {
  const host = /^[a-z]+:\/\//i.test(hostOrUrl) ? displayHost(hostOrUrl) : displayHost(`https://${hostOrUrl}`);
  if (!host || !host.includes(".") || /^\d+(\.\d+){3}$/.test(host)) return null;
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const keep = SECOND_LEVEL.has(lastTwo) && labels.length >= 3 ? 3 : 2;
  return labels.slice(-keep).join(".");
}

const squash = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// Words companies drop from their domain ("Cashfree Payments" -> cashfree.com).
const CORPORATE_SUFFIXES = /\b(inc|ltd|limited|llc|gmbh|ag|sa|sas|srl|spa|plc|bv|nv|pvt|private|corp|corporation|co|company|group|holdings?|technologies|technology|tech|labs?|payments?|ai|hq)\b/g;

// Words a company may add to its name in its domain (getcred / cred-app /
// cashfreepayments). Anything else after the name is a different name:
// "creditsuisse" is not "cred".
const DOMAIN_AFFIXES = ["get", "try", "use", "join", "hq", "app", "inc", "group", "tech", "pay", "payments", "global", "labs", "ai", "io", "official", "online", "club", "finance", "capital", "security", "cyber", "health", "bank", "money"];

// Does this domain plausibly belong to this company? The domain's name part
// must equal the company name, with or without corporate suffixes, possibly
// with one affix from the list above:
// cred.club ~ "CRED", recurclub.com ~ "Recur Club", cashfree.com ~ "Cashfree Payments".
export function domainMatchesName(domain: string, name: string): boolean {
  const reg = registrableDomain(domain);
  if (!reg) return false;
  const label = squash(reg.split(".")[0]);
  if (label.length < 3) return false;
  const plain = name.toLowerCase().replace(/\./g, "");
  const names = new Set([squash(plain), squash(plain.replace(CORPORATE_SUFFIXES, " "))].filter((n) => n.length >= 3));
  for (const n of names) {
    if (label === n) return true;
    for (const affix of DOMAIN_AFFIXES) {
      if (label === n + affix || label === affix + n) return true;
    }
  }
  return false;
}
