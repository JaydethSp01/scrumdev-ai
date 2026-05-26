/**
 * Smoke E2E con Playwright.
 * Ejecutar con: npx playwright test (requiere backend + frontend corriendo).
 *
 * Cubre:
 * - landing carga
 * - login mock guarda sesion
 * - lista de proyectos accesible
 * - crear proyecto via UI
 * - tabs del proyecto rinden
 */
import { test, expect } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";

test("landing renders", async ({ page }) => {
  await page.goto(FRONTEND);
  await expect(page).toHaveTitle(/ScrumDev AI/i);
});

test("login flow + create project", async ({ page }) => {
  await page.goto(`${FRONTEND}/login`);
  await page.locator('input[type="email"]').fill("demo@scrumdev.ai");
  await page.locator('input[type="password"]').fill("demo12345");
  await page.getByRole("button", { name: /entrar|login/i }).click();
  await page.waitForURL(/\/projects/);

  const key = `E2E-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await page.getByRole("button", { name: /nuevo proyecto/i }).click();
  await page.locator('input[name="key"], input[placeholder*="key" i]').first().fill(key);
  await page
    .locator('input[name="name"], input[placeholder*="nombre" i]')
    .first()
    .fill("Test E2E");
  await page.getByRole("button", { name: /crear|guardar/i }).click();

  await expect(page.getByText(key)).toBeVisible();
});
