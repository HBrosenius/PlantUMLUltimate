import type { DiagramLinkActions } from "./diagram-link-guard";

/** One chooser shared by all SVG previews, including links activated from the keyboard. */
export function showDiagramLinkMenu(actions: DiagramLinkActions): () => void {
  const menu = document.createElement("div");
  menu.className = "application-menu-panel diagram-link-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Linked element");
  const destination = document.createElement("p");
  destination.className = "diagram-link-destination";
  destination.textContent = actions.url;
  menu.append(destination);
  const previous = document.activeElement;
  const close = (restoreFocus = true) => {
    menu.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("resize", dismiss);
    document.removeEventListener("scroll", dismiss, true);
    if (restoreFocus && (previous instanceof HTMLElement || previous instanceof SVGElement) && previous.isConnected)
      previous.focus({ preventScroll: true });
  };
  const addAction = (label: string, action: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      close();
      action();
    });
    menu.append(button);
  };
  if (actions.openSettings) addAction("Open settings", actions.openSettings);
  addAction("Open URL", actions.openUrl);
  const outside = (event: Event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) close(false);
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button")];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  };
  const dismiss = () => close(false);
  (actions.origin.closest(".app") ?? document.body).append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(actions.x, window.innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(actions.y, window.innerHeight - bounds.height - 8))}px`;
  menu.querySelector("button")?.focus({ preventScroll: true });
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keyboard, true);
  window.addEventListener("resize", dismiss);
  document.addEventListener("scroll", dismiss, true);
  return () => close(false);
}
