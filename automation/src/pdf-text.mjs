import fs from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjs.VerbosityLevel && pdfjs.setVerbosityLevel?.(pdfjs.VerbosityLevel.ERRORS);

export async function extractPdfText(filePath, options = {}) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const document = await pdfjs.getDocument({
    data,
    password: options.password,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel?.ERRORS,
  }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }

  return pages.join("\n");
}
