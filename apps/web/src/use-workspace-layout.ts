import { useLayoutEffect, type RefObject } from "react";

/** Keep floating panels below wrapping toolbars without re-rendering the editor. */
export function useWorkspaceLayout(workspace: RefObject<HTMLElement | null>, ready: boolean) {
  useLayoutEffect(() => {
    const element = workspace.current;
    const app = element?.closest<HTMLElement>(".app");
    if (!ready || !element || !app) return;
    const measure = () => {
      const scale = app.getBoundingClientRect().width / app.offsetWidth || 1;
      app.style.setProperty("--workspace-top", `${element.getBoundingClientRect().top / scale + 8}px`);
      const footer = app.querySelector(".statusbar");
      app.style.setProperty("--footer-height", `${(footer?.getBoundingClientRect().height ?? 30) / scale + 8}px`);
    };
    const observer = new ResizeObserver(measure);
    for (const target of app.querySelectorAll(".toolbar, .statusbar")) observer.observe(target);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [workspace, ready]);
}
