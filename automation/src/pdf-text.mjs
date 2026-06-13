import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const execFileAsync = promisify(execFile);

pdfjs.VerbosityLevel && pdfjs.setVerbosityLevel?.(pdfjs.VerbosityLevel.ERRORS);

async function extractWithPdfToText(filePath, options = {}) {
  const args = ["-layout"];
  if (options.password) args.push("-upw", options.password);
  args.push(filePath, "-");
  const { stdout } = await execFileAsync("pdftotext", args, { maxBuffer: 1024 * 1024 * 50 });
  return stdout;
}

async function extractWithPdfJs(filePath, options = {}) {
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

export async function extractPdfText(filePath, options = {}) {
  if (options.preferPdfJs !== true) {
    try {
      const text = await extractWithPdfToText(filePath, options);
      if (text.trim()) return text;
    } catch {
      // Poppler/pdftotext is optional. Fall back to pdfjs when it is missing or fails.
    }
  }

  return extractWithPdfJs(filePath, options);
}
