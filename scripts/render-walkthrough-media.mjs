import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const frames = [
  { path: "docs/screenshots/local-dashboard-overview.png", duration: 2.8 },
  { path: "docs/screenshots/local-dashboard-builder-locked.png", duration: 2.8 },
];
const mp4 = "docs/walkthroughs/nodeagent-local-dashboard-walkthrough.mp4";
const gif = "docs/walkthroughs/nodeagent-local-dashboard-walkthrough.gif";

main();

function main() {
  for (const frame of frames) {
    if (!existsSync(frame.path)) throw new Error(`missing walkthrough source frame ${frame.path}`);
  }
  ensureParent(mp4);
  ensureParent(gif);
  const tempDir = mkdtempSync(`${tmpdir()}/nodeagent-walkthrough-`);
  try {
    const listPath = `${tempDir}/frames.txt`;
    writeFileSync(listPath, concatList(frames));
    run("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vf", "scale=960:-2,fps=12,format=yuv420p",
      "-movflags", "+faststart",
      mp4,
    ]);
    run("ffmpeg", [
      "-y",
      "-i", mp4,
      "-vf", "fps=8,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      gif,
    ]);
    console.log(`walkthrough media: PASS ${mp4} ${gif}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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
