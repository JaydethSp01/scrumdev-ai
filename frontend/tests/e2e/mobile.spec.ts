/**
 * Validación MOBILE en producción: layout, sin scroll horizontal, login y
 * navegación 100% manejables en pantalla de teléfono.
 */
import { test, expect } from "@playwright/test";

const F = "https://scrumdevai.vercel.app";
const EMAIL = "adam@scrumdev.ai";
const PASS = "adam-demo-2026";

// viewport de teléfono en Chromium (lo que define el layout responsive es el
// ancho 390px; hasTouch habilita .tap()). Evita WebKit (no instalado).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe("Mobile end-to-end", () => {
  test.describe.configure({ timeout: 120000 });

  async function noHScroll(page: import("@playwright/test").Page, label: string) {
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(sw, `${label}: overflow horizontal (${sw} > ${iw})`).toBeLessThanOrEqual(iw + 2);
  }

  test("1. Login en móvil: formulario usable y sin overflow", async ({ page }) => {
    await page.goto(`${F}/login`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    // el formulario (email, password, entrar) debe verse y ser tocable
    const email = page.locator('input[type="email"]');
    const pass = page.locator('input[type="password"]');
    await expect(email).toBeVisible();
    await expect(pass).toBeVisible();
    await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
    // el panel de marca (izq, primero en el DOM) está oculto en móvil; el logo
    // móvil (último en el DOM) sí aparece.
    await expect(page.getByText("ScrumDev AI").last()).toBeVisible();
    await noHScroll(page, "login");
    // tap real en los campos
    await email.tap();
    await email.fill(EMAIL);
    await pass.fill(PASS);
  });

  test("2. Login móvil completo -> /projects manejable", async ({ page }) => {
    await page.goto(`${F}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.getByRole("button", { name: /entrar/i }).tap();
    await page.waitForURL(/\/projects/, { timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await noHScroll(page, "projects");
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(100);
  });

  test("3. Proyecto en móvil: tabs navegables sin overflow", async ({ page }) => {
    await page.goto(`${F}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.getByRole("button", { name: /entrar/i }).tap();
    await page.waitForURL(/\/projects/, { timeout: 60000 });
    // entrar al primer proyecto
    const first = page.locator('a[href*="/projects/"]').first();
    await first.tap();
    await page.waitForURL(/\/projects\/.+/, { timeout: 30000 });
    await page.keyboard.press("Escape").catch(() => {}); // cerrar tour si abre
    await page.waitForTimeout(2000);
    await noHScroll(page, "proyecto");
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(200);
  });
});
