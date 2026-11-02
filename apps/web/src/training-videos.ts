import course from "../public/training/videos.json";
import type { DiagramKind } from "./model";

type HelpGroup = "General" | "Editing" | DiagramKind;
const groups: Record<string, HelpGroup> = {
  "demo-overview": "General",
  "demo-outline": "Editing",
  "demo-scenario-lab": "gantt",
  "demo-forecast": "gantt",
  "demo-task-check-in": "gantt",
  "demo-wbs-gantt": "wbs",
  "01": "General",
  "02": "Editing",
  "03": "gantt",
  "04": "gantt",
  "05": "gantt",
  "06": "gantt",
  "07": "gantt",
  "08": "wbs",
  "09": "General",
  "10": "sequence",
  "11": "usecase",
  "12": "class",
  "13": "component",
  "14": "activity",
  "15": "Editing",
  "16": "Editing",
  "17": "General",
  "19": "General",
  "20": "General",
};

/** Only saved YouTube uploads appear in Help; the same manifest powers the course index. */
export const trainingVideos = [...course.demos, ...course.lessons].flatMap((lesson) => {
  const group = groups[lesson.id];
  return lesson.youtubeId && group
    ? [
        {
          id: lesson.id,
          label: lesson.id.startsWith("demo-") ? "Demo" : lesson.id,
          title: lesson.title,
          group,
          url: `https://www.youtube.com/watch?v=${lesson.youtubeId}`,
          searchText: [
            "video tutorial training lesson",
            lesson.id,
            lesson.title,
            lesson.objective,
            ...lesson.chapters.map((chapter) => chapter.title),
          ].join(" "),
        },
      ]
    : [];
});
