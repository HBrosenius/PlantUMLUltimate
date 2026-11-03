declare const __APP_VERSION__: string;

export function appIdentity(address: string) {
  const url = new URL(address);
  const local =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname === "[::1]";
  return {
    local,
    address: url.origin,
    host: url.host,
    environment: local ? "Local development" : url.hostname === "plantuml.brosenius.se" ? "Production" : "Hosted app",
    version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "development",
  };
}

export function applyAppIdentity() {
  if (!appIdentity(window.location.href).local) return;
  document.title = "PlantUML Ultimate — Local";
  document.querySelector('link[rel="manifest"]')?.setAttribute("href", "/manifest-local.webmanifest");
  document.querySelector('link[rel="icon"]')?.setAttribute("href", "/icon-local.svg");
}

export function jiraNetworkError(endpoint: string, address: string): string {
  const identity = appIdentity(address);
  return identity.local
    ? `This app is running locally at ${identity.address}. Jira needs the local server to be running. Start that server, or open https://plantuml.brosenius.se and use Jira there.`
    : `Could not reach the Jira integration service at ${endpoint}. Check your internet connection and whether your browser or network is blocking this address, then try again.`;
}
