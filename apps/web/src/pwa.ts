import { useCallback, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export const PWA_UPDATE_INTERVAL_MS = 5 * 60 * 1_000;

export function watchForServiceWorkerUpdates(
  registration: Pick<ServiceWorkerRegistration, "update">,
  intervalMs = PWA_UPDATE_INTERVAL_MS,
) {
  let checking = false;
  const check = () => {
    if (checking || !navigator.onLine || document.visibilityState !== "visible") return;
    checking = true;
    void registration
      .update()
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  };
  const checkWhenVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  const interval = window.setInterval(check, intervalMs);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", checkWhenVisible);
  check();
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", checkWhenVisible);
  };
}

export function isInstalledDisplayMode(
  matchesStandalone = window.matchMedia("(display-mode: standalone)").matches,
  navigatorStandalone = Boolean((navigator as NavigatorWithStandalone).standalone),
) {
  return matchesStandalone || navigatorStandalone;
}

export function usePwa() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker>();
  const installed = isInstalledDisplayMode();

  useEffect(() => {
    let stopUpdateChecks: (() => void) | undefined;
    let disposed = false;
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      if (isInstalledDisplayMode()) return;
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installedApp = () => setInstallPrompt(undefined);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedApp);

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      const register = async () => {
        const registration = await navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" });
        if (disposed) return;
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
          });
        });
        stopUpdateChecks = watchForServiceWorkerUpdates(registration);
      };
      void register().catch(() => undefined);
    }

    return () => {
      disposed = true;
      stopUpdateChecks?.();
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installedApp);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let controlled = Boolean(navigator.serviceWorker.controller);
    const controllerChanged = () => {
      if (controlled) window.location.reload();
      controlled = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(undefined);
  }, [installPrompt]);

  const update = useCallback(() => waitingWorker?.postMessage("SKIP_WAITING"), [waitingWorker]);

  return {
    online,
    canInstall: !installed && Boolean(installPrompt),
    updateAvailable: Boolean(waitingWorker),
    install,
    update,
  };
}
