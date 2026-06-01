import { test } from "@playwright/test";
test.use({ viewport: { width: 1280, height: 800 } });
test("shot goal", async ({ page }) => {
  await page.goto("https://goal89298-web.vercel.app", { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/tmp/goal.png", fullPage: true });
  const body = (await page.locator("body").innerText()).trim();
  console.log("VISIBLE(", body.length, "):", body.slice(0,150).replace(/\n+/g," | "));
});
