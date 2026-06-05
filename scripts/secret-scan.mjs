#!/usr/bin/env node
/**
 * secret-scan.mjs — refuse to ship secrets.
 *
 *   npm run secret-scan        (also runs in `npm run prepush`)
 *
 * Scans exactly the files git WOULD commit (tracked + untracked-not-ignored),
 * so anything in .gitignore — including .env.local — is never inspected and
 * never shippable. Matches are reported by pattern name + location only; the
 * secret value itself is redacted so the scan output is safe to paste.
 *
 * Exit 0 = clean. Exit 1 = potential secret OR a tracked .env file.
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();

const PATTERNS = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "OpenAI API key", re: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{30,}/g },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/g },
  { name: "GitHub PAT (classic)", re: /ghp_[0-9A-Za-z]{36}/g },
  { name: "GitHub PAT (fine-grained)", re: /github_pat_[0-9A-Za-z_]{50,}/g },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: "Convex deploy key", re: /(?:prod|dev):[a-z-]+-\d+\|ey[A-Za-z0-9._-]{20,}/g },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { name: "Generic bearer secret", re: /(?:secret|token|password|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/gi },
];

const BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2",
  ".ttf", ".pdf", ".zip", ".gz", ".mp4", ".mov", ".lock",
]);

const ALLOW_ENV = new Set([".env.example"]);

function gitFiles() {
  try {
    const out = execSync("git ls-files --cached --others --exclude-standard", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return walk(ROOT);
  }
}

function walk(dir) {
  const skip = new Set(["node_modules", ".git", "dist", "build", ".vite"]);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else {
      const rel = relative(ROOT, full).replace(/\\/g, "/");
      // Belt-and-suspenders: never scan-or-allow a non-example dotenv in fallback mode.
      if (/(^|\/)\.env(\.|$)/.test(rel) && !ALLOW_ENV.has(rel.split("/").pop())) {
        out.push(rel); // include so the tracked-env check below can flag it
      } else {
        out.push(rel);
      }
    }
  }
  return out;
}

function redact(match) {
  const s = String(match);
  return `${s.slice(0, 4)}…[${s.length} chars]`;
}

function main() {
  const files = gitFiles();
  const findings = [];
  const trackedEnv = [];

  for (const rel of files) {
    const base = rel.split("/").pop();
    if (/^\.env(\..*)?$/.test(base) && !ALLOW_ENV.has(base)) {
      trackedEnv.push(rel);
    }
    if (BINARY.has(extname(rel).toLowerCase())) continue;
    let text;
    try {
      const full = join(ROOT, rel);
      if (statSync(full).size > 2_000_000) continue; // skip huge files
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const before = text.slice(0, m.index);
        const line = before.split(/\r?\n/).length;
        const lineText = lines[line - 1] ?? "";
        // Ignore obvious placeholders / examples.
        if (/your[_-]?key|placeholder|example|xxxx|\.\.\./i.test(lineText)) continue;
        findings.push({ file: rel, line, pattern: name, redacted: redact(m[0]) });
      }
    }
  }

  let failed = false;

  if (trackedEnv.length > 0) {
    failed = true;
    console.error("\n✗ SECRET-SCAN: dotenv files would be committed (must be gitignored):");
    for (const f of trackedEnv) console.error(`    ${f}`);
  }

  if (findings.length > 0) {
    failed = true;
    console.error("\n✗ SECRET-SCAN: potential secrets detected:");
    for (const f of findings) {
      console.error(`    ${f.file}:${f.line}  ${f.pattern}  (${f.redacted})`);
    }
  }

  if (failed) {
    console.error("\nRefusing to proceed. Remove the secrets or add the files to .gitignore.\n");
    process.exit(1);
  }

  console.log(`✓ SECRET-SCAN: clean — scanned ${files.length} files, no secrets, no tracked dotenv.`);
}

main();
