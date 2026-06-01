import { test } from "@playwright/test";
test.use({ viewport: { width: 1280, height: 800 } });
test("screenshot tienda", async ({ page }) => {
  await page.goto("https://tienda87598-web.vercel.app", { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/tienda.png", fullPage: true });
  console.log("screenshot guardado");
});
