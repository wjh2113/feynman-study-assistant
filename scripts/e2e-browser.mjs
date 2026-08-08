import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: false,
  args: ["--start-maximized"]
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle" });
console.log("TITLE", await page.title());
console.log("URL", page.url());
console.log("TEXT", (await page.locator("body").innerText()).slice(0, 6000));
await page.screenshot({ path: "e2e-start.png", fullPage: true });
await page.waitForTimeout(5000);
await browser.close();
