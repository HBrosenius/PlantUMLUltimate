import { downloadBlob, rasterizeSvg, svgToPngBlob } from "./file-service";

/** A4 in PDF points (1/72 inch). */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
/** CSS pixels are 1/96 inch, PDF points 1/72 inch. */
const POINTS_PER_CSS_PIXEL = 0.75;

export function pdfFileName(fileName: string): string {
  return fileName.replace(/\.(pumlu|puml|plantuml)$/i, "") + ".pdf";
}

/** Picks a backtick fence longer than any backtick run inside the source. */
export function markdownFence(source: string): string {
  const longestRun = Math.max(0, ...[...source.matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(Math.max(3, longestRun + 1));
}

export function plantUmlMarkdown(source: string): string {
  const fence = markdownFence(source);
  return `${fence}plantuml\n${source.replace(/\n+$/, "")}\n${fence}`;
}

/** Wiki markup for the "PlantUML for Confluence" macro. */
export function confluencePlantUmlMarkup(source: string): string {
  return `{plantuml}\n${source.replace(/\n+$/, "")}\n{plantuml}`;
}

/**
 * Page size in points for a diagram of the given CSS pixel size: its natural print size, scaled
 * down to fit A4 in the orientation that matches the diagram's aspect.
 */
export function pdfPageSize(width: number, height: number): { width: number; height: number } {
  const landscape = width > height;
  const maxWidth = landscape ? A4_LONG : A4_SHORT;
  const maxHeight = landscape ? A4_SHORT : A4_LONG;
  const natural = { width: width * POINTS_PER_CSS_PIXEL, height: height * POINTS_PER_CSS_PIXEL };
  const scale = Math.min(1, maxWidth / natural.width, maxHeight / natural.height);
  return { width: round(natural.width * scale), height: round(natural.height * scale) };
}

const round = (value: number) => Math.round(value * 100) / 100;

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);

/**
 * Builds a single-page PDF 1.4 whose page is filled by one baseline JPEG embedded with /DCTDecode.
 */
export function buildJpegPdf({
  jpeg,
  pixelWidth,
  pixelHeight,
  pageWidth,
  pageHeight,
}: {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  pageWidth: number;
  pageHeight: number;
}): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const object = (body: string | Uint8Array[]) => {
    offsets.push(length);
    push(ascii(`${offsets.length} 0 obj\n`));
    if (typeof body === "string") push(ascii(body));
    else body.forEach(push);
    push(ascii("\nendobj\n"));
  };

  // The binary comment marks the file as binary for transfer tools.
  push(ascii("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      "/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
  );
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  object(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object([
    ascii(
      `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    ),
    jpeg,
    ascii("\nendstream"),
  ]);

  const xrefOffset = length;
  push(
    ascii(
      `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` +
        offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
        `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  const pdf = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, position);
    position += chunk.length;
  }
  return pdf;
}

export async function downloadDiagramPdf(svg: string, fileName: string, scale = 2): Promise<void> {
  const { blob, width, height } = await rasterizeSvg(svg, { scale, type: "image/jpeg", background: "#ffffff" });
  const page = pdfPageSize(width, height);
  const pdf = buildJpegPdf({
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    pixelWidth: Math.round(width * scale),
    pixelHeight: Math.round(height * scale),
    pageWidth: page.width,
    pageHeight: page.height,
  });
  downloadBlob(new Blob([pdf], { type: "application/pdf" }), pdfFileName(fileName));
}

/**
 * Copies the diagram as PNG. The blob is handed to ClipboardItem as a promise so Safari still
 * treats the write as part of the user gesture while the image rasterizes.
 */
export async function copyDiagramImage(svg: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("This browser cannot copy images to the clipboard. Export PNG instead.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": svgToPngBlob(svg) })]);
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("This browser does not allow clipboard access here.");
  }
  await navigator.clipboard.writeText(text);
}
