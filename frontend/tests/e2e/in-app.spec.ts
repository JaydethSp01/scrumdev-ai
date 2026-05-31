/**
 * Pruebas DENTRO del aplicativo (navegador real) — valida que cada tab del
 * proyecto renderiza con contenido real y sin errores JS, como un usuario.
 */
import { test, expect, type Page } from "@playwright/test";

const F = process.env.FRONTEND_URL || "http://localhost:3000";
const PROJECT = "E2EFLOW";

async function login(page: Page) {
  await page.goto(`${F}/login`);
  await page.locator('input[type="email"]').fill("e2e@scrumdev.ai");
  await page.locator('input[type="password"]').fill("e2e-pass-2026");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/projects/, { timeout: 45000 });
}

function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/HMR|Download the React|Failed to load resource|404|ERR_BLOCKED|favicon/.test(t)) return;
    errs.push(t.slice(0, 140));
  });
  return errs;
}

test.describe("Pruebas dentro del aplicativo", () => {
  test.describe.configure({ timeout: 120000 });

  test("1. Login y lista de proyectos", async ({ page }) => {
    const errs = trackErrors(page);
    await login(page);
    await page.goto(`${F}/projects`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const body = await page.locator("body").innerText();
    expect(body).toContain("E2EFLOW");
    expect(errs, errs.join(" | ")).toHaveLength(0);
  });

  // cada tab: renderiza con contenido + cero errores JS
  const TABS: { tab: string; mustContain: string[] }[] = [
    { tab: "overview", mustContain: ["Resumen", "HISTORIAS"] },
    { tab: "pipeline", mustContain: ["Ciclo de vida", "Fase"] },
    { tab: "boards", mustContain: ["Boards", "Versión"] },
    { tab: "architecture", mustContain: ["Decisiones del proyecto"] },
    { tab: "agents", mustContain: ["agentes"] },
    { tab: "decisions", mustContain: ["Decisiones"] },
    { tab: "versions", mustContain: ["Versiones"] },
    { tab: "integrations", mustContain: ["Jira"] },
  ];

  for (const { tab, mustContain } of TABS) {
    test(`2. Tab ${tab} renderiza con contenido`, async ({ page }) => {
      const errs = trackErrors(page);
      await login(page);
      await page.goto(`${F}/projects/${PROJECT}?tab=${tab}`);
      await page.waitForLoadState("networkidle", { timeout: 30000 });
      await page.waitForTimeout(1800);
      const body = await page.locator("body").innerText();
      expect(body.length, `${tab} casi vacío`).toBeGreaterThan(300);
      for (const txt of mustContain) {
        expect(body, `${tab} debería contener "${txt}"`).toContain(txt);
      }
      expect(errs, `${tab} JS errors: ${errs.join(" | ")}`).toHaveLength(0);
    });
  }

  test("3. Boards: v1 muestra sprints con tareas", async ({ page }) => {
    const errs = trackErrors(page);
    await login(page);
    await page.goto(`${F}/projects/${PROJECT}?tab=boards`);
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    // abre en una version con sprints -> muestra "Sprint N" y las 3 columnas
    // (las columnas se renderizan en mayusculas via CSS, comparar case-insensitive)
    expect(body).toMatch(/Sprint \d/);
    expect(body).toMatch(/por hacer/i);
    expect(body).toMatch(/hecho/i);
    expect(errs, errs.join(" | ")).toHaveLength(0);
  });

  test("4. Crear tarea en Boards persiste", async ({ page }) => {
    await login(page);
    await page.goto(`${F}/projects/${PROJECT}?tab=boards`);
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2000);
    // abrir el "+ Tarea" (columna Por hacer) y crear
    const addBtn = page.getByRole("button", { name: /^Tarea$/ }).first();
    await expect(addBtn, "debe haber boton + Tarea").toBeVisible({ timeout: 10000 });
    await addBtn.click();
    const input = page.locator('input[placeholder*="Enter"], input[placeholder*="Título"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    const titulo = `Tarea in-app ${Date.now() % 100000}`;
    await input.fill(titulo);
    await input.press("Enter");
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    expect(body, "la tarea creada debe aparecer").toContain(titulo);
  });

  test("5. Pipeline: el gate muestra qué aprobar", async ({ page }) => {
    const errs = trackErrors(page);
    await login(page);
    await page.goto(`${F}/projects/${PROJECT}?tab=pipeline`);
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    // E2EFLOW está en un gate -> debe mostrar título de aprobación + botón
    expect(body).toMatch(/aprobar|Aprobar|Apruebo/i);
    expect(errs, errs.join(" | ")).toHaveLength(0);
  });
});
