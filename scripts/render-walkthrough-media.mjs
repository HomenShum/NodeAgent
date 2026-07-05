import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const frames = [
  { path: "docs/screenshots/local-dashboard-overview.png", duration: 2.8 },
  { path: "docs/screenshots/local-dashboard-builder-locked.png", duration: 2.8 },
];
const mp4 = "docs/walkthroughs/nodeagent-local-dashboard-walkthrough.mp4";
const gif = "docs/walkthroughs/nodeagent-local-dashboard-walkthrough.gif";

// Rendered media must clear this floor to count as a real artifact rather
// than an empty/corrupt container (committed mp4 is ~64 KB, gif ~180 KB).
const MIN_ARTIFACT_BYTES = 10 * 1024;

// --check: verify the render pipeline end-to-end (source frames -> mp4 -> gif)
// without touching the committed media. Lossy encoders (x264, GIF palettegen)
// are NOT byte-deterministic across ffmpeg builds, so CI cannot demand that a
// fresh render byte-match the committed files; it renders to a temp dir and
// validates the outputs instead. Run without --check to regenerate the
// committed media after changing the source screenshots.
const checkMode = process.argv.includes("--check");

main();

function main() {
  for (const frame of frames) {
    if (!existsSync(frame.path)) throw new Error(`missing walkthrough source frame ${frame.path}`);
  }
  const tempDir = mkdtempSync(`${tmpdir()}/nodeagent-walkthrough-`);
  try {
    const mp4Out = checkMode ? `${tempDir}/walkthrough.mp4` : mp4;
    const gifOut = checkMode ? `${tempDir}/walkthrough.gif` : gif;
    if (!checkMode) {
      ensureParent(mp4);
      ensureParent(gif);
    }
    const listPath = `${tempDir}/frames.txt`;
    writeFileSync(listPath, concatList(frames));
    run("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vf", "scale=960:-2,fps=12,format=yuv420p",
      "-movflags", "+faststart",
      mp4Out,
    ]);
    run("ffmpeg", [
      "-y",
      "-i", mp4Out,
      "-vf", "fps=8,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      gifOut,
    ]);
    assertArtifact(mp4Out, "rendered mp4");
    assertArtifact(gifOut, "rendered gif");
    if (checkMode) {
      // The committed media is what README links serve; make sure it exists
      // and is a real artifact, not a placeholder.
      assertArtifact(mp4, "committed mp4");
      assertArtifact(gif, "committed gif");
      console.log(`walkthrough media check: PASS pipeline renders and committed media present (${mp4} ${gif})`);
    } else {
      console.log(`walkthrough media: PASS ${mp4} ${gif}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertArtifact(path, label) {
  if (!existsSync(path)) throw new Error(`${label} missing: ${path}`);
  const size = statSync(path).size;
  if (size < MIN_ARTIFACT_BYTES) {
    throw new Error(`${label} too small (${size} bytes < ${MIN_ARTIFACT_BYTES}): ${path}`);
  }
}

function concatList(items) {
  const lines = [];
  for (const item of items) {
    lines.push(`file '${ffmpegPath(resolve(item.path))}'`);
    lines.push(`duration ${item.duration}`);
  }
  lines.push(`file '${ffmpegPath(resolve(items.at(-1).path))}'`);
  return `${lines.join("\n")}\n`;
}

function ffmpegPath(path) {
  return path.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function ensureParent(path) {
  const parent = dirname(path);
  if (parent && parent !== ".") mkdirSync(parent, { recursive: true });
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${[result.stdout, result.stderr].join("\n").slice(-2000)}`);
  }
}
