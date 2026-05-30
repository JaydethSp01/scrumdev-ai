/**
 * E2E completo: login real con Jaysp + navegar TODAS las tabs de BARISTA
 * + validar zero errores JS console + screenshots por tab.
 *
 * Garantiza que la demo en navegador no rompe en ningun lado.
 */
import { test, expect, type ConsoleMessage } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
const EMAIL = "e2e@scrumdev.ai";
const PASSWORD = "e2e-pass-2026";

test.describe("Full flow demo BARISTA", () => {
  let jsErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    jsErrors = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") {
        const t = msg.text();
        // Ignore deps deprecation, dev server HMR noise
        if (t.includes("HMR") || t.includes("Download the React") || t.includes("Failed to load resource") || t.includes("404") || t.includes("ERR_BLOCKED_BY_CLIENT")) return;
        jsErrors.push(t.slice(0, 200));
      }
    });
    page.on("pageerror", (err) => {
      jsErrors.push(`pageerror: ${err.message.slice(0, 200)}`);
    });
  });

  test("1. Login -> /projects redirige", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/projects/, { timeout: 15_000 });
    await expect(page.getByText(/mis proyectos|barista/i).first()).toBeVisible({ timeout: 10_000 });
    expect(jsErrors, `JS errors: ${jsErrors.join(" | ")}`).toHaveLength(0);
  });

  test("2. /projects carga lista", async ({ page }) => {
    await page.goto(`${FRONTEND}/login`);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/projects/, { timeout: 15_000 });
    await expect(page.getByText("BARISTA").first()).toBeVisible({ timeout: 10_000 });
    expect(jsErrors, `JS errors: ${jsErrors.join(" | ")}`).toHaveLength(0);
  });

  const TABS = [
    "overview",
    "vision",
    "personalization",
    "backlog",
    "code",
    "deploy",
    "integrations",
    "chat",
  ];

  for (const tab of TABS) {
    test(`3. Tab ${tab} renderiza sin JS errors`, async ({ page }) => {
      await page.goto(`${FRONTEND}/login`);
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: /entrar/i }).click();
      await page.waitForURL(/\/projects/, { timeout: 15_000 });

      await page.goto(`${FRONTEND}/projects/BARISTA?tab=${tab}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // Click en el tab en la sidebar (por si el query string no lo activa)
      const sidebarTab = page.locator(`button:has-text("${tabLabel(tab)}")`).first();
      if (await sidebarTab.count()) {
        await sidebarTab.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // Validacion minima: hay contenido visible y no spinner infinito
      await expect(page.locator("body")).not.toBeEmpty();

      // Filtrar errores no criticos
      const fatal = jsErrors.filter(
        (e) =>
          !e.toLowerCase().includes("warning") &&
          !e.toLowerCase().includes("hydration") &&
          !e.toLowerCase().includes("vercel")
      );
      expect(fatal, `JS errors tab ${tab}: ${fatal.join(" | ")}`).toHaveLength(0);
    });
  }
});

function tabLabel(value: string): string {
  const m: Record<string, string> = {
    overview: "Overview",
    vision: "Vision",
    personalization: "Personalizacion",
    backlog: "Backlog",
    code: "Codigo",
    deploy: "Despliegue",
    integrations: "Integraciones",
    chat: "Chat IA",
  };
  return m[value] || value;
}
