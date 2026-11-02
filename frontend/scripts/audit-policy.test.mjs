import { assessAudit } from "./audit-policy.mjs";
const url = "https://github.com/advisories/GHSA-g3hv-75wg-m249";
function input(version = "3.1.5", dev = true, advisory = url) {
  return [{ metadata: { vulnerabilities: { moderate: 1 } }, vulnerabilities: {
    minimatch: { via: [{ url: advisory }], nodes: ["node_modules/minimatch"] },
    eslint: { via: ["minimatch"], nodes: ["node_modules/eslint"] },
  } }, { packages: { "node_modules/minimatch": { version, dev } } }];
}
describe("dependency audit policy", () => {
  it("allows only reviewed legacy dev copies and reports the exception", () => {
    for (const v of ["3.1.5", "5.1.9"]) {
      const result = assessAudit(...input(v));
      expect(result.failures).toEqual([]);
      expect(result.exceptions).toHaveLength(1);
    }
  });
  it("fails modern affected or production copies", () => {
    expect(assessAudit(...input("10.2.6")).failures).toHaveLength(1);
    expect(assessAudit(...input("3.1.5", false)).failures).toHaveLength(1);
  });
  it("fails any other advisory", () => {
    expect(assessAudit(...input("3.1.5", true, "https://example.com/new" )).failures).toHaveLength(1);
  });
  it("fails closed on unavailable or incomplete reports", () => {
    expect(() => assessAudit({ error: {} }, {})).toThrow();
    const [report, lock] = input();
    delete report.vulnerabilities.minimatch;
    expect(() => assessAudit(report, lock)).toThrow();
  });
});
