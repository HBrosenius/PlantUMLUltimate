// Builds the demo MP4 from recorded frames and narration clips placed at each scene start.
// Usage: node scripts/demo-video/build.mjs --audio <dir> --out <file.mp4> [--recording <dir>]
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, index, all) => (index % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), all[index + 1]]]),
      [],
    ),
);
const recording = resolve(args.recording ?? join(here, "out", "recording"));
const audioDir = args.audio && resolve(args.audio);
const output = resolve(args.out ?? join(here, "out", "wbs-gantt-demo.mp4"));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const { frames, scenes, end } = JSON.parse(readFileSync(join(recording, "timeline.json"), "utf8"));

const origin = frames[0].ts;
const list = frames
  .map((frame, index) => {
    const next = frames[index + 1]?.ts ?? end;
    return `file '${join(recording, "frames", frame.file)}'\nduration ${Math.max(0.001, next - frame.ts).toFixed(4)}`;
  })
  .join("\n");
// The concat demuxer ignores the last entry's duration unless the file is repeated.
writeFileSync(join(recording, "frames.txt"), `${list}\nfile '${join(recording, "frames", frames.at(-1).file)}'\n`);

const inputs = ["-f", "concat", "-safe", "0", "-i", join(recording, "frames.txt")];
const filters = [];
const mixed = [];
if (audioDir) {
  for (const [index, scene] of scenes.entries()) {
    const file = readdirSync(audioDir).find((name) => name.startsWith(scene.id + "."));
    if (!file) throw new Error(`Missing audio for ${scene.id}`);
    inputs.push("-i", join(audioDir, file));
    const delay = Math.max(0, Math.round((scene.start - origin + 0.25) * 1000));
    filters.push(`[${index + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[a${index}]`);
    mixed.push(`[a${index}]`);
  }
  filters.push(`${mixed.join("")}amix=inputs=${mixed.length}:normalize=0:dropout_transition=0,apad[aout]`);
}

execFileSync(
  ffmpeg,
  [
    "-y",
    ...inputs,
    ...(audioDir ? ["-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]", "-shortest"] : []),
    "-vf",
    "scale=1920:1080:flags=lanczos,format=yuv420p",
    "-fps_mode",
    "cfr",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    ...(audioDir ? ["-c:a", "aac", "-b:a", "192k"] : []),
    output,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
console.log(`Wrote ${output}`);
