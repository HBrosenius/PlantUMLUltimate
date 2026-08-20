export function sourceForPlantUmlRenderer(source: string): string {
  const lines = source.split(/\r?\n/);
  let inNote = false;
  return lines
    .map((line) => {
      if (/^\s*note\s+(?:bottom|top|left|right)\s*:\s*.+$/i.test(line)) return "' note rendered by PlantUML Studio";
      if (/^\s*note\s+(?:bottom|top|left|right)\s*$/i.test(line)) {
        inNote = true;
        return "' note rendered by PlantUML Studio";
      }
      if (inNote && /^\s*end\s+note\s*$/i.test(line)) {
        inNote = false;
        return "";
      }
      return inNote ? "" : line;
    })
    .join("\n");
}
