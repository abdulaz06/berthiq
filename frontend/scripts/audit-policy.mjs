// See DOCS/DEPENDENCY_SECURITY.md. Only the reviewed legacy dev-only copies
// are excepted; modern minimatch uses the patched upstream implementation.
const reviewed = "https://github.com/advisories/GHSA-g3hv-75wg-m249";
export function assessAudit(report, lock) {
  if (report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities)
    throw new Error("Missing or failed npm audit report");
  const exceptions = [];
  const failures = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    if (!entry.via?.length || !entry.nodes?.length)
      throw new Error(`Incomplete audit entry: ${name}`);
    for (const via of entry.via) {
      if (typeof via === "string") {
        if (!report.vulnerabilities[via])
          throw new Error(`Missing transitive advisory: ${via}`);
        continue; // Every referenced entry is inspected in this same loop.
      }
      const legacyDevOnly = entry.nodes.every((path) => {
        const pkg = lock.packages?.[path];
        return pkg?.dev === true && ["3.1.5", "5.1.9"].includes(pkg.version);
      });
      if (name === "minimatch" && via.url === reviewed && legacyDevOnly)
        exceptions.push(`${name}: ${reviewed} (reviewed legacy dev-only copies)`);
      else failures.push(`${name}: ${via.url ?? via.title ?? "unknown advisory"}`);
    }
  }
  if (Object.keys(report.vulnerabilities).length && !exceptions.length && !failures.length)
    throw new Error("Audit has no concrete advisory evidence");
  return { exceptions, failures };
}
