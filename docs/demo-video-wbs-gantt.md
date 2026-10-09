# Demo video script: from WBS to a connected Gantt plan

Length: about 2 minutes 20 seconds, 11 narration clips (~370 words). Recorded at 1920×1080 from the `codex/wbs-gantt-project` branch (commit `7d7b2ae`), because the WBS hover card and in-node progress aren't on `main` yet.

The clip text lives in [`scripts/demo-video/narration.json`](../scripts/demo-video/narration.json). If you edit a line, edit it there too, since the recorder reads that file.

## How to produce the voice in ElevenLabs

1. Generate **one audio file per clip** below. Paste only the quoted narration text, without the heading.
2. Name each file with its clip ID, for example `01-intro.mp3`, `02-create.mp3`, …, `11-outro.mp3` (mp3, wav or m4a all work).
3. Put all 11 files in one folder and send me the path.

I'll re-record the screen so each scene lasts exactly as long as its clip, then build the final MP4.

Suggested voice settings: a warm, confident narrator voice (for example a "narration" or "conversational" voice), Stability ≈ 45–55 %, Similarity ≈ 75 %, Style ≈ 15–25 %, speaker boost on. Use the same voice and settings for every clip so they sound continuous.

Pronunciation notes: "WBS" is spelled out (W-B-S). "PlantUML" is "plant U-M-L". "Gantt" rhymes with "want". If the voice gets any of these wrong, write them phonetically in that clip ("Plant U M L").

---

## 01-intro

**On screen:** The diagram chooser. The cursor picks WBS diagram, and a Website redesign breakdown appears. The cursor visits the root, then Discovery, Design and Delivery.

> Every project starts with one question: what exactly are we delivering? In PlantUML Ultimate, you answer it with a work breakdown structure. Here's a website redesign, split into Discovery, Design and Delivery, with the work packages underneath each phase.

## 02-create

**On screen:** Click **Create Gantt chart from WBS**. In the dialog, type the name "Website redesign", set the start date to 5 October 2026, and click Create Gantt chart.

> Then the next question arrives: when will it be done, and who is doing it? Normally, that means retyping everything into a separate planning tool. Here, you click Create Gantt chart from WBS, give the project a name, pick a start date... and that's it.

## 03-project

**On screen:** The project navigator opens beside the new Gantt chart, listing the two diagrams and ten WBS-to-Gantt links. The cursor moves down the list of links.

> You now have one project with two connected diagrams: the breakdown and the schedule. The project navigator lists every link, node to task, so nothing gets lost in translation. And because both are plain PlantUML text, the whole plan can live in Git, right next to your code.

## 04-gantt

**On screen:** The navigator closes. The cursor tours the Gantt chart: phase sections, task bars, the closed weekends, and a link icon.

> And here is the Gantt chart. Every work package is a task, every phase has its own section, weekends are already closed, and the structure of the breakdown is wired up as dependencies. The link icon on each bar tells you it's tied to the WBS.

## 05-plan-alice

**On screen:** Click the Stakeholder interviews bar. In the task inspector, set Complete to 100, then add the person Alice. The bar label becomes "Stakeholder interviews {Alice}".

> Now let's plan. Stakeholder interviews are done, so we mark them one hundred percent complete, and assign Alice.

## 06-plan-bob

**On screen:** Click Content inventory. Set Complete to 60 and add Bob. The bar fills to 60 %.

> Content inventory is well underway. Sixty percent, and Bob owns it.

## 07-plan-carol

**On screen:** Click Visual design. Change Duration from 5 to 8 days and add Carol. The bar grows, and Carol's row appears in the resource view.

> Visual design needs more time than the default. We make it eight days, and put Carol on it. The bar grows the moment you type.

## 08-back-to-wbs

**On screen:** Click **Open linked WBS node** in the inspector. The WBS opens with progress bars inside the Stakeholder interviews (full) and Content inventory (60 %) boxes. The cursor points at them, then at Quality assurance, which hasn't started.

> Now, one click takes us back to the WBS, and this is where the connection pays off. Progress from the schedule shows up right inside each box, so you can see at a glance what's done, and what hasn't started yet.

## 09-hover

**On screen:** Hover Stakeholder interviews, then Content inventory, then Visual design. Each time a card shows the dates, duration, Complete and people (for example 2026-10-19 → 2026-10-23, 5 days, 100 %, Alice 100 %).

> Hover over any work package to see the plan behind it: the dates, the duration, how far along it is, and who's assigned. Your stakeholders get scope and status in one picture, without ever opening the Gantt chart.

## 10-rename

**On screen:** Click Visual design in the WBS and rename it to "Visual design & branding". Click **Open linked Gantt task**. The Gantt shows "Visual design & branding {Carol}".

> And the link works both ways. Rename a work package in the WBS, and the Gantt task follows automatically. Structure lives in the breakdown, dates and people live in the schedule, and PlantUML Ultimate keeps them in sync.

## 11-outro

**On screen:** An end card fades in: "WBS and Gantt, always connected. Plan the what and the when together, in PlantUML Ultimate."

> One breakdown. One schedule. Always connected. Plan the what, and the when, together, in PlantUML Ultimate.

---

## Rebuilding the video

Start the `web-wbs-gantt` launch configuration (port 5225), then:

```bash
node scripts/demo-video/record.mjs --audio <folder-with-clips>
node scripts/demo-video/build.mjs --audio <folder-with-clips> --out scripts/demo-video/out/wbs-gantt-demo.mp4
```

Both scripts need `ffmpeg`/`ffprobe` on the PATH, or set `FFMPEG` and `FFPROBE` to their paths (`brew install ffmpeg` provides both).
