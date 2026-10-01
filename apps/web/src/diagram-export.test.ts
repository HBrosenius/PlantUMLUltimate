import { describe, expect, it } from "vitest";
import {
  buildJpegPdf,
  confluencePlantUmlMarkup,
  markdownFence,
  pdfFileName,
  pdfPageSize,
  plantUmlMarkdown,
} from "./diagram-export";

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("diagram export text", () => {
  it("wraps source in a plantuml fence", () => {
    expect(plantUmlMarkdown("@startuml\nA -> B\n@enduml\n")).toBe("```plantuml\n@startuml\nA -> B\n@enduml\n```");
  });

  it("uses a fence longer than any backtick run in the source", () => {
    expect(markdownFence("A -> B")).toBe("```");
    expect(markdownFence("note: `code`")).toBe("```");
    expect(markdownFence("note: ```code```")).toBe("````");
    expect(plantUmlMarkdown("x ````` y")).toBe("``````plantuml\nx ````` y\n``````");
  });

  it("wraps source in the Confluence PlantUML macro", () => {
    expect(confluencePlantUmlMarkup("@startuml\nA -> B\n@enduml\n")).toBe(
      "{plantuml}\n@startuml\nA -> B\n@enduml\n{plantuml}",
    );
  });

  it("names PDFs after the document", () => {
    expect(pdfFileName("Roadmap.pumlu")).toBe("Roadmap.pdf");
    expect(pdfFileName("diagram.puml")).toBe("diagram.pdf");
  });
});

describe("pdfPageSize", () => {
  it("keeps small diagrams at print size", () => {
    expect(pdfPageSize(400, 200)).toEqual({ width: 300, height: 150 });
  });

  it("fits wide diagrams within A4 landscape", () => {
    const page = pdfPageSize(4000, 1000);
    expect(page.width).toBeCloseTo(841.89, 1);
    expect(page.height).toBeCloseTo(210.47, 1);
  });

  it("fits tall diagrams within A4 portrait", () => {
    const page = pdfPageSize(1000, 4000);
    expect(page.height).toBeCloseTo(841.89, 1);
    expect(page.width).toBeCloseTo(210.47, 1);
    const square = pdfPageSize(2000, 2000);
    expect(square).toEqual({ width: 595.28, height: 595.28 });
  });
});

describe("buildJpegPdf", () => {
  // SOI, APP0 stub and EOI; includes non-ASCII bytes to prove binary data survives untouched.
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x0a, 0x0d, 0x80, 0xff, 0xd9]);
  const pdf = buildJpegPdf({ jpeg, pixelWidth: 4, pixelHeight: 2, pageWidth: 300, pageHeight: 150 });
  const text = latin1(pdf);

  it("starts with a PDF header and ends with %%EOF", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("declares the page, image and drawing operators", () => {
    expect(text).toContain("/MediaBox [0 0 300 150]");
    expect(text).toContain("/Width 4 /Height 2");
    expect(text).toContain("/Filter /DCTDecode /Length 13");
    expect(text).toContain("q 300 0 0 150 0 0 cm /Im0 Do Q");
    const content = "q 300 0 0 150 0 0 cm /Im0 Do Q";
    expect(text).toContain(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  it("embeds the JPEG bytes verbatim", () => {
    const start = text.indexOf("stream\n\xff\xd8") + "stream\n".length;
    expect(Array.from(pdf.slice(start, start + jpeg.length))).toEqual(Array.from(jpeg));
    expect(text.slice(start + jpeg.length, start + jpeg.length + 10)).toBe("\nendstream");
  });

  it("has xref offsets that point at each object", () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 5)).toBe("xref\n");
    const xref = /xref\n0 (\d+)\n((?:\d{10} \d{5} [fn] \n)+)trailer\n<< \/Size (\d+) \/Root 1 0 R >>/.exec(
      text.slice(startxref),
    );
    expect(xref).not.toBeNull();
    expect(xref?.[1]).toBe("6");
    expect(xref?.[3]).toBe("6");
    const entries = xref![2]!.match(/.{20}/gs)!;
    expect(entries).toHaveLength(6);
    expect(entries[0]).toBe("0000000000 65535 f \n");
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });
});
