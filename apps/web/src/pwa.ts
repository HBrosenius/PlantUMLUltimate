import { useCallback, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwa() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker>();

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", beforeInstall);

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      const register = async () => {
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
          });
        });
      };
      void register().catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
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

  return { online, canInstall: Boolean(installPrompt), updateAvailable: Boolean(waitingWorker), install, update };
}
