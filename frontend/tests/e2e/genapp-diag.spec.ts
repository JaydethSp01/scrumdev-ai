import { test } from "@playwright/test";
const URL = "https://flow57556-web.vercel.app";
test("diagnostico app generada", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 220)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text().slice(0, 220)); });
  let status = 0;
  page.on("response", (r) => { if (r.url() === URL || r.url() === URL + "/") status = r.status(); });
  await page.goto(URL, { waitUntil: "load", timeout: 45000 }).catch((e) => errs.push("GOTO: " + e.message.slice(0,120)));
  await page.waitForTimeout(5000);
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  console.log("HTTP_STATUS:", status);
  console.log("BODY:", body.replace(/\n+/g, " | "));
  console.log("ERRORS:\n" + (errs.join("\n") || "ninguno"));
});
