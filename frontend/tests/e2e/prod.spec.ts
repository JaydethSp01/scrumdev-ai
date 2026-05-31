/**
 * E2E contra PRODUCCIÓN: frontend Vercel -> backend HF Space -> Neon.
 * Valida el flujo real que vería Adam.
 */
import { test, expect, type Page } from "@playwright/test";

const F = "https://scrumdevai.vercel.app";
const EMAIL = "adam@scrumdev.ai";
const PASS = "adam-demo-2026";

test.describe("Producción end-to-end", () => {
  test.describe.configure({ timeout: 180000 });

  test("1. La raíz / redirige al login", async ({ page }) => {
    await page.goto(`${F}/`);
    await page.waitForURL(/\/login/, { timeout: 30000 });
    await expect(page.getByText(/Bienvenido de vuelta/i)).toBeVisible({ timeout: 15000 });
    // la landing vieja NO debe aparecer
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("EL FLUJO");
  });

  test("2. Login real -> /projects (front Vercel -> backend HF -> Neon)", async ({ page }) => {
    await page.goto(`${F}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/projects/, { timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(120);
  });

  test("3. Crear proyecto en vivo y abrir tabs", async ({ page }) => {
    // login
    await page.goto(`${F}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASS);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/projects/, { timeout: 60000 });

    // crear proyecto (modo libre)
    const key = `PROD${Date.now() % 100000}`;
    await page.getByRole("button", { name: /nuevo proyecto/i }).click();
    await page.getByText(/describir libre|desde cero|libre/i).first().click().catch(() => {});
    const keyInput = page.locator('input[placeholder="MIAPP"]');
    await expect(keyInput).toBeVisible({ timeout: 20000 });
    await keyInput.fill(key);
    await page.locator('input[placeholder="Mi App"]').fill("Prod Demo");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.locator("textarea").first().fill(
      "Una app de notas colaborativas para equipos: crear, etiquetar, buscar y compartir notas por proyecto."
    );
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: /crear proyecto/i }).click();
    await page.waitForURL(/\/projects\/.+/, { timeout: 60000 });
    expect(page.url()).toContain(key);

    // cerrar tour si aparece, abrir tabs reales (pegan al backend HF)
    await page.keyboard.press("Escape").catch(() => {});
    const baseUrl = page.url().split("?")[0];
    for (const tab of ["overview", "agents", "pipeline"]) {
      await page.goto(`${baseUrl}?tab=${tab}`);
      await page.waitForTimeout(2500);
      const body = await page.locator("body").innerText();
      expect(body.length, `tab ${tab} vacío`).toBeGreaterThan(200);
    }
    // agentes deben venir del backend HF (10 agentes)
    await page.goto(`${baseUrl}?tab=agents`);
    await page.waitForTimeout(3000);
    const agentsBody = await page.locator("body").innerText();
    expect(agentsBody.toLowerCase()).toContain("agent");
  });
});
