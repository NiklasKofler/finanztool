import fs from "node:fs/promises";
import path from "node:path";
import { ensureFlatexLogin, launchFlatexBrowser } from "./flatex-browser.mjs";

const keepOpen = process.argv.includes("--keep-open");
const { context, page } = await launchFlatexBrowser();

try {
  await ensureFlatexLogin(page);
  const map = await page.locator("body").evaluate(() => ({
    url: location.href,
    title: document.title,
    headings: [...document.querySelectorAll("h1,h2,h3")]
      .filter((element) => element instanceof HTMLElement && element.offsetParent)
      .map((element) => element.innerText.trim())
      .filter(Boolean)
      .slice(0, 100),
    buttons: [...document.querySelectorAll("button,input[type=button],input[type=submit]")]
      .filter((element) => element instanceof HTMLElement && element.offsetParent)
      .map((element) => ({
        text:
          element instanceof HTMLInputElement
            ? element.value
            : element instanceof HTMLElement
              ? element.innerText.trim()
              : "",
        id: element.id || null,
        name: element.getAttribute("name"),
      }))
      .filter((item) => item.text)
      .slice(0, 200),
    links: [...document.querySelectorAll("a")]
      .filter((element) => element instanceof HTMLElement && element.offsetParent)
      .map((element) => ({
        text: element.innerText.trim(),
        href: element.getAttribute("href"),
      }))
      .filter((item) => item.text)
      .slice(0, 200),
  }));

  const target = path.resolve("runtime", "flatex-page-map.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  console.log(`[ok] Flatex-Seitenstruktur gespeichert: ${target}`);
  if (keepOpen) {
    console.log("[info] Browser bleibt offen. Zum Beenden im Terminal Ctrl+C druecken.");
    await new Promise(() => {});
  }
} finally {
  await context.close();
}
