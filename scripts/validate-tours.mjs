/**
 * Validate .tours/*.tour: every file must exist and every line number must be
 * inside that file and not blank. A tour with a broken reference is worse than
 * no tour, so this runs as its own check.
 *
 *   node scripts/validate-tours.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const toursDir = join(root, ".tours");
const issues = [];
let steps = 0;

const files = existsSync(toursDir)
  ? readdirSync(toursDir).filter((f) => f.endsWith(".tour"))
  : [];
if (files.length === 0) issues.push("no .tour files found in .tours/");

for (const name of files) {
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
    const target = join(root, step.file);
    if (!existsSync(target)) return issues.push(`${where}: no such file ${step.file}`);
    if (typeof step.line !== "number") return issues.push(`${where}: missing line`);
    const lines = readFileSync(target, "utf8").split("\n");
    if (step.line < 1 || step.line > lines.length) {
      return issues.push(`${where}: line ${step.line} out of range in ${step.file} (${lines.length} lines)`);
    }
    if (lines[step.line - 1].trim() === "") {
      issues.push(`${where}: line ${step.line} in ${step.file} is blank`);
    }
    if (!step.description || step.description.length < 20) {
      issues.push(`${where}: description missing or too short`);
    }
  });
}

if (issues.length === 0) {
  console.log(`tours validate: PASS ${files.length} tours, ${steps} steps, every location resolves`);
} else {
  console.error("tours validate: FAIL");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exitCode = 1;
}
