/**
 * Web Interface Guidelines review — the DOM measurements (PROMOTION condition 7).
 *
 * Condition 7 is a REVIEW, not a tool run. A Lighthouse score is not a WIG
 * review: Lighthouse never looks at hit-target size, at iOS input zoom, at
 * whether an infinite animation has a reduced-motion escape, or at whether the
 * browser chrome matches the page. This script measures the checklist items
 * that a machine CAN settle, at both widths, and writes them next to the
 * guideline they belong to. The judgement — which findings are major — lives in
 * `promotion/WIG_REVIEW.md` and is a human call made against those numbers.
 *
 * Checklist source (fetched 2026-08-13): https://vercel.com/design/guidelines
 *
 * Run:  node e2e/wig-review.mjs
 * Exits NONZERO if any check marked `major: true` fails.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "promotion", "evidence");
const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 4904);
const URL_ = `http://localhost:${PORT}/`;
const QUESTION = "Does our wedge hold versus Acme, and does the runway model survive 18 months?";

const server = spawn(
  process.execPath,
  [join(root, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
server.stderr.on("data", (d) => process.stderr.write(d));
const stop = () => {
  if (!server.killed) server.kill();
};
process.on("exit", stop);

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(URL_)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server did not answer on ${URL_} within ${timeoutMs}ms`);
}

/** Runs in the page. Returns raw numbers only — no verdicts. */
function measure() {
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const interactive = [
    ...document.querySelectorAll('a, button, [role="button"], input, textarea, select, [tabindex]:not([tabindex="-1"])'),
  ]
    // Elements a finger cannot hit are not hit targets. assistant-ui ships a
    // hidden autosize mirror <textarea>, and decorative nodes are aria-hidden;
    // measuring those would report a defect no user can experience.
    .filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        cs.pointerEvents !== "none" &&
        el.closest('[aria-hidden="true"]') === null
      );
    })
    .map((el) => {
      const cs = getComputedStyle(el);
      // WIG "No dead zones on controls — checkboxes & radios share a single
      // generous hit target with label": a wrapped checkbox's hit target is
      // its <label>, not the 13x13 box the browser draws.
      const hit = (el.closest("label") ?? el).getBoundingClientRect();
      return {
        selector: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).trim().split(/\s+/).join(".")}` : ""),
        width: Math.round(hit.width),
        height: Math.round(hit.height),
        hitTargetIsLabel: el.closest("label") !== null,
        fontSizePx: px(cs.fontSize),
        touchAction: cs.touchAction,
        accessibleName: (el.getAttribute("aria-label") ?? el.closest("label")?.textContent ?? el.textContent ?? "")
          .trim()
          .slice(0, 40),
      };
    });
  const composer = document.querySelector(".na-composer-input");
  const dot = document.querySelector(".na-dot");
  const sheetCell = document.querySelector(".na-sheet td");
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    interactive,
    // WIG Interactions — "Mobile input size": <16px triggers iOS Safari auto-zoom.
    composerFontSizePx: composer ? px(getComputedStyle(composer).fontSize) : null,
    // WIG Interactions — "Respect zoom".
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
    // WIG Design — "Browser UI matches your background" / "Set the appropriate color-scheme".
    themeColorMeta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
    htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
    // WIG Animations — "Honor prefers-reduced-motion".
    dotAnimation: dot
      ? {
          name: getComputedStyle(dot).animationName,
          durationMs: Math.round(parseFloat(getComputedStyle(dot).animationDuration) * 1000),
          iterationCount: getComputedStyle(dot).animationIterationCount,
        }
      : null,
    // WIG Content — "Headings & skip link".
    headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
      level: Number(h.tagName[1]),
      text: h.textContent.trim().slice(0, 40),
    })),
    hasSkipLink: [...document.querySelectorAll("a[href^='#']")].some((a) =>
      /skip/i.test(a.textContent ?? ""),
    ),
    // WIG Content — "Tabular numbers for comparisons".
    sheetNumericVariant: sheetCell ? getComputedStyle(sheetCell).fontVariantNumeric : null,
    // WIG Content — "Accurate page titles".
    title: document.title,
    // WIG Content — "Icon-only buttons are named": every control must have a name.
    unnamedControls: [...document.querySelectorAll("button, a")].filter(
      (el) => !(el.getAttribute("aria-label") ?? el.textContent ?? "").trim(),
    ).length,
  };
}

const failures = [];
let report = {};

try {
  await waitForServer();
  const browser = await chromium.launch();
  const widths = {};

  for (const [label, viewport] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["mobile-375", { width: 375, height: 812 }],
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(URL_, { waitUntil: "networkidle" });
    const empty = await page.evaluate(measure);
    await page.fill(".na-composer-input", QUESTION);
    await page.keyboard.press("Enter");
    await page.locator(".na-memo").first().waitFor({ timeout: 45_000 });
    await page.waitForTimeout(3_000);
    const populated = await page.evaluate(measure);
    await page.screenshot({ path: join(OUT_DIR, `wig-${label}.png`) });
    widths[label] = { empty, populated, screenshot: `promotion/evidence/wig-${label}.png` };
    await page.close();
  }

  // WIG Animations — "Honor prefers-reduced-motion". Measured, not read: the
  // page is loaded with the media feature actually set.
  const reducedPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await reducedPage.goto(URL_, { waitUntil: "networkidle" });
  const reducedMotion = await reducedPage.evaluate(() => {
    const dot = document.querySelector(".na-dot");
    const cs = dot ? getComputedStyle(dot) : null;
    // The computed style alone is NOT evidence: headless Chromium reports
    // animation-name "none" whenever the media feature is emulated, whether or
    // not the page honours it. This probe passed on a tree with no
    // prefers-reduced-motion rule anywhere. So assert the RULE, from CSSOM.
    let ruleFound = false;
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.media && /prefers-reduced-motion/.test(rule.conditionText ?? rule.media.mediaText)) {
            ruleFound = true;
          }
        }
      } catch {
        /* cross-origin sheet (the Google Fonts one) — not ours */
      }
    }
    return {
      mediaMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      reducedMotionRuleInStylesheet: ruleFound,
      dotAnimationName: cs?.animationName ?? null,
      dotAnimationDurationMs: cs ? Math.round(parseFloat(cs.animationDuration) * 1000) : null,
      dotIterationCount: cs?.animationIterationCount ?? null,
    };
  });
  await reducedPage.close();
  await browser.close();

  const m = widths["mobile-375"].empty;
  const d = widths["desktop-1440"].populated;
  const smallTargets = (state, min) =>
    state.interactive.filter((el) => el.width > 0 && (el.width < min || el.height < min));

  // Each check names the guideline it enforces. `major: true` fails the gate.
  const checks = [
    {
      guideline: "Interactions — Mobile input size (<input> font >=16px on mobile)",
      major: true,
      measured: `composer font-size ${m.composerFontSizePx}px at 375w`,
      pass: (m.composerFontSizePx ?? 0) >= 16,
    },
    {
      guideline: "Interactions — Respect zoom (never disable browser zoom)",
      major: true,
      measured: `viewport meta: ${m.viewportMeta}`,
      pass: !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(m.viewportMeta ?? ""),
    },
    {
      guideline: "Interactions — Match visual & hit targets (>=44px on mobile)",
      major: true,
      measured: `${smallTargets(widths["mobile-375"].populated, 44).length} control(s) under 44px at 375w: ${JSON.stringify(smallTargets(widths["mobile-375"].populated, 44).map((e) => `${e.selector} ${e.width}x${e.height}`))}`,
      pass: smallTargets(widths["mobile-375"].populated, 44).length === 0,
    },
    {
      guideline: "Animations — Honor prefers-reduced-motion",
      major: true,
      measured: `@media (prefers-reduced-motion) rule in own stylesheet: ${reducedMotion.reducedMotionRuleInStylesheet}; with reduce emulated, .na-dot animation ${reducedMotion.dotAnimationName} x${reducedMotion.dotIterationCount} @ ${reducedMotion.dotAnimationDurationMs}ms (emulation alone forces this, so it is not the assertion)`,
      pass: reducedMotion.mediaMatches && reducedMotion.reducedMotionRuleInStylesheet,
    },
    {
      guideline: "Content — Headings & skip link (hierarchical h1-h6)",
      major: true,
      measured: `desktop populated headings: ${JSON.stringify(d.headings.map((h) => h.level))}`,
      pass:
        d.headings.length > 0 &&
        d.headings[0].level === 1 &&
        d.headings.every((h, i) => i === 0 || h.level - d.headings[i - 1].level <= 1),
    },
    {
      guideline: "Content — Icon-only buttons are named",
      major: true,
      measured: `${d.unnamedControls} control(s) with no accessible name`,
      pass: d.unnamedControls === 0,
    },
    {
      guideline: "Design — Set the appropriate color-scheme",
      major: false,
      measured: `html color-scheme: ${d.htmlColorScheme}`,
      pass: /dark/.test(d.htmlColorScheme ?? ""),
    },
    {
      guideline: "Design — Browser UI matches your background (theme-color)",
      major: false,
      measured: `theme-color meta: ${d.themeColorMeta ?? "absent"}`,
      pass: d.themeColorMeta !== null,
    },
    {
      guideline: "Content — Tabular numbers for comparisons",
      major: false,
      measured: `.na-sheet td font-variant-numeric: ${d.sheetNumericVariant ?? "no sheet rendered"}`,
      pass: /tabular-nums/.test(d.sheetNumericVariant ?? ""),
    },
    {
      guideline: "Content — Headings & skip link (skip-to-content link)",
      major: false,
      measured: `skip link present: ${d.hasSkipLink}`,
      pass: d.hasSkipLink,
    },
    {
      guideline: "Interactions — Prevent double-tap zoom on controls (touch-action)",
      major: false,
      measured: `${widths["mobile-375"].populated.interactive.filter((e) => e.touchAction !== "manipulation").length} of ${widths["mobile-375"].populated.interactive.length} controls without touch-action: manipulation`,
      pass: widths["mobile-375"].populated.interactive.every((e) => e.touchAction === "manipulation"),
    },
    {
      guideline: "Content — Accurate page titles",
      major: false,
      measured: `<title>: ${d.title}`,
      pass: Boolean(d.title && d.title.trim().length > 3),
    },
  ];

  for (const c of checks) if (c.major && !c.pass) failures.push(`${c.guideline} — ${c.measured}`);

  mkdirSync(OUT_DIR, { recursive: true });
  report = {
    capturedAt: new Date().toISOString(),
    checklistSource: "https://vercel.com/design/guidelines",
    checklistFetchedAt: "2026-08-13",
    url: URL_,
    checks,
    reducedMotion,
    widths,
    result: failures.length ? "FAIL" : "PASS",
    failures,
  };
  writeFileSync(join(OUT_DIR, "wig-review.json"), `${JSON.stringify(report, null, 2)}\n`);
} catch (err) {
  console.error(`FAIL wig-review: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  stop();
}

const minor = report.checks.filter((c) => !c.major && !c.pass);
if (failures.length) {
  console.error("FAIL wig-review — major findings:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`  ${minor.length} minor finding(s); full report -> promotion/evidence/wig-review.json`);
  process.exit(1);
}
console.log(
  `PASS wig-review: ${report.checks.filter((c) => c.major).length} major checks pass, ` +
    `${minor.length} minor finding(s) recorded -> promotion/evidence/wig-review.json`,
);
