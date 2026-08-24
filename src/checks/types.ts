export interface Finding {
  file: string;
  line: number;
  ruleId: string;
  description: string;
  // Internal only: SHA-256 of the matched secret, set by the gitleaks-backed
  // checks so dedup can tell two different secrets of the same rule in the
  // same file apart. Hashed (never the plaintext) because Finding flows into
  // the report, and stripped in cli.ts before anything is printed.
  secretHash?: string;
}
