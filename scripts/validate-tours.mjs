/**
 * Validate every citation this repo makes into its own source, in the only way
 * that means anything: the cited line must still contain the thing it was cited
 * for. A line number alone proves nothing — code moves, the number stays in
 * range, and the citation now points at an unrelated symbol while the check
 * stays green.
 *
 * Two artefacts are checked.
 *
 *   .tours/*.tour        every step carries the `anchor` substring that
 *                        scripts/build-tours.mjs resolved into `line`; the
 *                        cited line must still contain it.
 *   docs/START_HERE.md   every fenced snippet whose first line is a
 *                        `// path/to/file.ts:12-20` comment must open with the
 *                        text that really lives at that first cited line. Line
 *                        numbers in prose are rejected outright, because
 *                        nothing there is quoted and so nothing can be checked.
 *
 *   node scripts/validate-tours.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const issues = [];

const srcCache = new Map();
function linesOf(file) {
  if (!srcCache.has(file)) srcCache.set(file, readFileSync(join(root, file), "utf8").split("\n"));
  return srcCache.get(file);
}

// ---------------------------------------------------------------- .tours/*.tour
const toursDir = join(root, ".tours");
let steps = 0;
const tourFiles = existsSync(toursDir)
  ? readdirSync(toursDir).filter((f) => f.endsWith(".tour"))
  : [];
if (tourFiles.length === 0) issues.push("no .tour files found in .tours/");

for (const name of tourFiles) {
  let tour;
  try {
    tour = JSON.parse(readFileSync(join(toursDir, name), "utf8"));
  } catch (e) {
    issues.push(`${name}: not valid JSON — ${e.message}`);
    continue;
  }
  if (!tour.title) issues.push(`${name}: missing title`);
  if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
    issues.push(`${name}: no steps`);
    continue;
  }
  tour.steps.forEach((step, i) => {
    steps += 1;
    const where = `${name} step ${i + 1}`;
    if (!step.file) return issues.push(`${where}: missing file`);
    if (!existsSync(join(root, step.file))) return issues.push(`${where}: no such file ${step.file}`);
    if (typeof step.line !== "number") return issues.push(`${where}: missing line`);
    if (typeof step.anchor !== "string" || step.anchor.trim() === "") {
      return issues.push(`${where}: missing anchor — every step must name the text it points at (rebuild with \`npm run tours:build\`)`);
    }
    const lines = linesOf(step.file);
    if (step.line < 1 || step.line > lines.length) {
      return issues.push(`${where}: line ${step.line} out of range in ${step.file} (${lines.length} lines)`);
    }
    if (!lines[step.line - 1].includes(step.anchor)) {
      issues.push(
        `${where}: ${step.file}:${step.line} does not contain its anchor ${JSON.stringify(step.anchor)} — it holds ${JSON.stringify(lines[step.line - 1].trim())}. Rebuild with \`npm run tours:build\`.`,
      );
    }
    if (!step.description || step.description.length < 20) {
      issues.push(`${where}: description missing or too short`);
    }
  });
}

// ------------------------------------------------------------ START_HERE.md
const DOC = "docs/START_HERE.md";
const CITE = /([\w./-]+\.(?:ts|tsx|mjs|html|css|json)):(\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*)/;
/** Two-way: the doc dedents and sometimes joins lines, so either may contain the other. */
const matches = (fileLine, docLine) => fileLine.includes(docLine) || docLine.includes(fileLine);

let citations = 0;
if (!existsSync(join(root, DOC))) {
  issues.push(`${DOC}: missing — the walkthrough every new reader is sent to`);
} else {
  const doc = linesOf(DOC);
  let inFence = false;
  for (let i = 0; i < doc.length; i += 1) {
    const line = doc[i];
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    const where = `${DOC}:${i + 1}`;
    if (!inFence) {
      if (CITE.test(line)) {
        issues.push(`${where}: line number in prose — nothing quotes it, so nothing can check it. Name the symbol instead.`);
      }
      if (/\bline \d+/.test(line)) {
        issues.push(`${where}: "line N" in prose — same problem. Name the symbol instead.`);
      }
      continue;
    }
    if (!/^\s*\/\//.test(line)) continue; // ordinary code, not a citation header
    const m = line.match(CITE);
    if (!m) continue;
    citations += 1;
    const [, file, rangeText] = m;
    if (!existsSync(join(root, file))) {
      issues.push(`${where}: no such file ${file}`);
      continue;
    }
    const src = linesOf(file);
    const starts = rangeText.split(",").map((r) => Number(r.trim().split("-")[0]));
    // The quoted snippet: everything up to the next citation header or the fence end.
    const body = [];
    for (let j = i + 1; j < doc.length && !doc[j].startsWith("```"); j += 1) {
      if (/^\s*\/\//.test(doc[j]) && CITE.test(doc[j])) break;
      if (doc[j].trim() !== "") body.push(doc[j].trim());
    }
    if (body.length === 0) {
      issues.push(`${where}: cites ${file}:${rangeText} but quotes nothing`);
      continue;
    }
    const bad = starts.filter((n) => n < 1 || n > src.length);
    if (bad.length) {
      issues.push(`${where}: line ${bad.join(", ")} out of range in ${file} (${src.length} lines)`);
      continue;
    }
    const head = src[starts[0] - 1].trim();
    if (!matches(head, body[0])) {
      issues.push(
        `${where}: ${file}:${starts[0]} holds ${JSON.stringify(head)}, but the snippet opens with ${JSON.stringify(body[0])}`,
      );
    }
    for (const n of starts.slice(1)) {
      const want = src[n - 1].trim();
      if (!body.some((b) => matches(want, b))) {
        issues.push(`${where}: ${file}:${n} holds ${JSON.stringify(want)}, which the snippet never quotes`);
      }
    }
  }
}

if (issues.length === 0) {
  console.log(
    `tours validate: PASS ${tourFiles.length} tours, ${steps} steps, ${citations} START_HERE citations — every anchor still lives on the line that cites it`,
  );
} else {
  console.error("tours validate: FAIL");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exitCode = 1;
}
