import { test, expect } from "@playwright/test";
const URL = "https://claude15021-web.vercel.app";
test.use({ viewport: { width: 1280, height: 800 } });
test("app generada con Claude corre sin error ni login Vercel", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 180)));
  // reintentar mientras Vercel termina de construir
  let ok = false, body = "";
  for (let i = 0; i < 8 && !ok; i++) {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(4000);
    body = await page.locator("body").innerText().catch(() => "");
    const building = body.includes("Deployment is building");
    const appErr = body.includes("Application error") || body.includes("client-side exception");
    if (!building) { ok = true; if (appErr) break; }
    if (building) await page.waitForTimeout(15000);
  }
  console.log("BODY(200):", body.slice(0, 200).replace(/\n+/g, " | "));
  console.log("pageerrors:", errs.join(" || ") || "ninguno");
  expect(body).not.toContain("Application error");
  expect(body).not.toContain("client-side exception");
  expect(body.toLowerCase()).not.toContain("authenticating");
  expect(body.trim().length).toBeGreaterThan(30);
});
