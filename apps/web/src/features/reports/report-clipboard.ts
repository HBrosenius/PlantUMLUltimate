export async function copyReport(html: string, plain: string): Promise<void> {
  if (!globalThis.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Formatted clipboard access is unavailable. Use Copy plain text or Select report text.");
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" }),
    }),
  ]);
}
export async function copyPlain(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable. Use Select report text.");
  await navigator.clipboard.writeText(text);
}
export async function copyChart(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Image clipboard access is unavailable. Download the PNG and insert it in your email.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
