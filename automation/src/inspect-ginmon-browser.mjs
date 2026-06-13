import fs from "node:fs/promises";
import path from "node:path";
import { ensureGinmonLogin, launchGinmonBrowser } from "./ginmon-browser.mjs";

const keepOpen = process.argv.includes("--keep-open");
const { context, page } = await launchGinmonBrowser();

try {
  const login = await ensureGinmonLogin(page);
  const map = await page.locator("body").evaluate(() => {
    const clickableSelector = "button,a,[role=button],[role=tab],[role=menuitem]";
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 12000),
      loginMode: null,
      clickables: [...document.querySelectorAll(clickableSelector)]
        .filter((element) => element instanceof HTMLElement && element.offsetParent)
        .map((element) => ({
          tag: element.tagName,
          id: element.id || null,
          cls: element.className?.toString?.() || "",
          role: element.getAttribute("role"),
          href: element.getAttribute("href"),
          aria: element.getAttribute("aria-label"),
          text: element.innerText?.trim?.() || element.textContent?.trim?.() || "",
        }))
        .filter((item) => item.text || item.href || item.aria)
        .slice(0, 400),
      inputs: [...document.querySelectorAll("input,select,textarea")]
        .filter((element) => element instanceof HTMLElement && element.offsetParent)
        .map((element) => ({
          tag: element.tagName,
          type: element.getAttribute("type"),
          id: element.id || null,
          name: element.getAttribute("name"),
          placeholder: element.getAttribute("placeholder"),
          value: element instanceof HTMLInputElement ? element.value : "",
        }))
        .slice(0, 100),
    };
  });
  map.loginMode = login.mode;

  const target = path.resolve("runtime", "ginmon-page-map.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  console.log(`[ok] Ginmon-Seitenstruktur gespeichert: ${target}`);
  if (keepOpen) {
    console.log("[info] Browser bleibt offen. Zum Beenden im Terminal Ctrl+C druecken.");
    await new Promise(() => {});
  }
} finally {
  await context.close();
}
