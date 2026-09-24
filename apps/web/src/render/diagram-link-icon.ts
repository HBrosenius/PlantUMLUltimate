/** Add the same small chain mark beside linked labels in WBS and Gantt SVGs. */
export function appendDiagramLinkIcon(label: SVGTextElement): void {
  const box = label.getBBox();
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "g");
  icon.setAttribute("class", "diagram-link-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("transform", `translate(${box.x + box.width + 6} ${box.y + box.height / 2 - 6}) scale(0.5)`);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  );
  icon.append(path);
  label.parentNode?.append(icon);
}
