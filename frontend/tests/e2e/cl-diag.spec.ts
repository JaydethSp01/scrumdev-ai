import { test } from "@playwright/test";
const URL = "https://cl277503-web.vercel.app";
test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: 60000 });
test("diag cl277503", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 300)); });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => errs.push("GOTO: " + e.message));
  await page.waitForTimeout(7000);
  const visible = (await page.locator("body").innerText().catch(() => "")).trim();
  console.log("VISIBLE_TEXT_LEN:", visible.length);
  console.log("VISIBLE_TEXT:", visible.slice(0, 200).replace(/\n+/g, " | "));
  console.log("ERRORS:\n" + (errs.join("\n") || "ninguno"));
});
