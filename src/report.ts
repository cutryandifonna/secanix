import type { Finding } from "./checks/types.js";

export type Severity = "critical" | "high" | "medium" | "low";

export interface ReportedFinding extends Finding {
  severity: Severity;
  fixSuggestion: string;
}

export interface CheckFindings {
  checkId: string;
  findings: Finding[];
}

interface RuleInfo {
  severity: Severity;
  fix: string;
}

// Static lookup for checks whose ruleId is a fixed, known-ahead-of-time set.
const RULE_INFO: Record<string, RuleInfo> = {
  "supabase-service-role-key-public-env": {
    severity: "critical",
    fix: "Jangan expose service role key lewat NEXT_PUBLIC_* — pindahin ke env var server-only, lalu rotate key ini di Supabase dashboard kalau udah sempet ke-deploy.",
  },
  "nextjs-api-route-missing-auth": {
    severity: "high",
    fix: "Tambahin auth check (getServerSession/getToken/dst) di awal handler sebelum jalanin logic apapun.",
  },
  "supabase-rls-disabled": {
    severity: "critical",
    fix: "Enable lagi RLS-nya (ALTER TABLE ... ENABLE ROW LEVEL SECURITY) dan pasang policy yang sesuai — jangan biarin RLS mati di production.",
  },
  "supabase-rls-missing": {
    severity: "high",
    fix: "Tambahin ALTER TABLE ... ENABLE ROW LEVEL SECURITY + policy buat tabel ini.",
  },
  "cors-wildcard-origin": {
    severity: "medium",
    fix: "Ganti '*' jadi daftar origin eksplisit yang emang butuh akses, atau validasi origin secara dinamis di server.",
  },
};

// gitleaks (secret-scan) and osv-scanner (dependency-cve) each emit a
// ruleId that varies per finding (rule name / GHSA id), so they're
// classified by checkId instead of an exhaustive per-ruleId table.
const SECRET_SCAN_FIX =
  "Cabut/rotate secret ini sekarang, hapus dari kode & git history (bukan cuma commit baru), pindahin ke env var / secret manager.";
const DEPENDENCY_CVE_FIX = "Update dependency ini ke versi yang udah di-patch (cek advisory-nya buat versi aman).";
const DEFAULT_FIX = "Cek temuan ini manual — belum ada saran otomatis buat rule ini.";

function cvssToSeverity(score: number): Severity {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

// dependencyVulnerabilities.ts embeds the CVSS score it got from
// osv-scanner into its own description as "(severity 8.1)" — that format
// is ours to rely on since we control where it's written.
function severityFromDescription(description: string): Severity | undefined {
  const match = /severity (\d+(?:\.\d+)?)/.exec(description);
  return match ? cvssToSeverity(Number(match[1])) : undefined;
}

export function classify(finding: Finding, checkId: string): ReportedFinding {
  const ruleInfo = RULE_INFO[finding.ruleId];
  if (ruleInfo) {
    return { ...finding, severity: ruleInfo.severity, fixSuggestion: ruleInfo.fix };
  }

  if (checkId === "secret-scan") {
    return { ...finding, severity: "critical", fixSuggestion: SECRET_SCAN_FIX };
  }

  if (checkId === "dependency-cve") {
    return {
      ...finding,
      severity: severityFromDescription(finding.description) ?? "high",
      fixSuggestion: DEPENDENCY_CVE_FIX,
    };
  }

  return { ...finding, severity: "medium", fixSuggestion: DEFAULT_FIX };
}

export interface IgnoreRule {
  file: string;
  ruleId: string;
  reason?: string;
}

export interface SuppressedFinding extends ReportedFinding {
  reason?: string;
}

export interface AppliedIgnoreRules {
  findings: ReportedFinding[];
  suppressed: SuppressedFinding[];
}

// file+ruleId must both match — narrow on purpose so an ignore entry never
// silently swallows an unrelated finding that happens to share one field.
export function applyIgnoreRules(reported: ReportedFinding[], ignoreRules: IgnoreRule[]): AppliedIgnoreRules {
  const findings: ReportedFinding[] = [];
  const suppressed: SuppressedFinding[] = [];

  for (const finding of reported) {
    const rule = ignoreRules.find((r) => r.file === finding.file && r.ruleId === finding.ruleId);
    if (rule) {
      suppressed.push({ ...finding, reason: rule.reason });
    } else {
      findings.push(finding);
    }
  }

  return { findings, suppressed };
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
const SEVERITY_RANK = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));

export function buildReport(checkFindings: CheckFindings[]): ReportedFinding[] {
  const reported = checkFindings.flatMap(({ checkId, findings }) =>
    findings.map((finding) => classify(finding, checkId))
  );

  return reported.sort((a, b) => SEVERITY_RANK.get(a.severity)! - SEVERITY_RANK.get(b.severity)!);
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export function formatReport(reported: ReportedFinding[]): string[] {
  if (reported.length === 0) return ["Nol temuan."];

  const lines: string[] = [`${reported.length} temuan:`];
  for (const severity of SEVERITY_ORDER) {
    const group = reported.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;

    lines.push(`[${SEVERITY_LABEL[severity]}] (${group.length})`);
    for (const finding of group) {
      lines.push(`  ${finding.file}:${finding.line} — ${finding.description} Fix: ${finding.fixSuggestion}`);
    }
  }
  return lines;
}
