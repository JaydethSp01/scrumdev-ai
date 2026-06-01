import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 1280, height: 800 } });
const APPS = [
  { name: "Inventario", url: "https://p0280273-web.vercel.app" },
  { name: "Citas", url: "https://p0280517-web.vercel.app" },
];
for (const app of APPS) {
  test(`${app.name} renderiza sin defectos`, async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
    await page.goto(app.url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(6000);
    const body = (await page.locator("body").innerText().catch(() => "")).trim();
    console.log(`${app.name} VISIBLE(${body.length}):`, body.slice(0, 160).replace(/\n+/g, " | "));
    console.log(`${app.name} ERRORS:`, errs.slice(0, 3).join(" || ") || "ninguno");
    expect(body, `${app.name} Application error`).not.toContain("Application error");
    expect(body, `${app.name} client-side`).not.toContain("client-side exception");
    expect(body.toLowerCase(), `${app.name} login Vercel`).not.toContain("authenticating");
    expect(body.length, `${app.name} pantalla casi vacía`).toBeGreaterThan(20);
  });
}
