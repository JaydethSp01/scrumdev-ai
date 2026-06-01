import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1280, height: 800 } });
test("inventario renderiza con diseño", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0,150)));
  await page.goto("https://tienda87598-web.vercel.app", { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(6000);
  const body = (await page.locator("body").innerText().catch(()=>"")).trim();
  // contar elementos con clases tailwind = señal de diseño
  const styled = await page.locator('[class*="rounded"], [class*="shadow"], [class*="grid"], [class*="flex"]').count();
  console.log("VISIBLE(", body.length, "):", body.slice(0,180).replace(/\n+/g," | "));
  console.log("ELEMENTOS CON ESTILO:", styled);
  console.log("ERRORS:", errs.slice(0,3).join(" || ") || "ninguno");
  expect(body).not.toContain("Application error");
  expect(body.length).toBeGreaterThan(20);
});
