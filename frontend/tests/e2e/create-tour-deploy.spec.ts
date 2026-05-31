/**
 * Goal del día: crear proyecto CON ARCHIVO + tour guiado accesible + feedback
 * de deploy. Prueba el flujo en la interfaz real (navegador).
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const F = process.env.FRONTEND_URL || "http://localhost:3000";

async function login(page: Page) {
  await page.goto(`${F}/login`);
  await page.locator('input[type="email"]').fill("e2e@scrumdev.ai");
  await page.locator('input[type="password"]').fill("e2e-pass-2026");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/projects/, { timeout: 45000 });
}

// documento de requisitos temporal para la subida
const DOC = path.join(os.tmpdir(), `reqs_vet_${Date.now()}.md`);
test.beforeAll(() => {
  fs.writeFileSync(
    DOC,
    "# VetCare\nPlataforma para clínica veterinaria: fichas de mascotas, citas con " +
      "veterinarios, historia clínica, vacunas y facturación a dueños. Usuarios: " +
      "recepcionista, veterinario y administrador. Funcionalidades: registro de " +
      "mascotas, agenda de citas, historia clínica, control de vacunas y reportes."
  );
});

test.describe("Crear con archivo + Tour + Deploy", () => {
  test.describe.configure({ timeout: 180000 });

  test("1. Crear proyecto SUBIENDO un documento (.md)", async ({ page }) => {
    await login(page);
    const key = `VET${Date.now() % 100000}`;
    await page.goto(`${F}/projects`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });

    // abrir modal de creación
    await page.getByRole("button", { name: /nuevo proyecto/i }).click();
    // elegir modo "Subir documento"
    await page.getByText(/subir documento/i).first().click();

    // subir el archivo
    await page.setInputFiles('input[type="file"]', DOC);
    // nombre del proyecto en el flujo de documento
    const nameInput = page.locator('input[placeholder*="Nombre"]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("VetCare");
    }
    // analizar (llama /intake/document — IA extrae la visión). Puede tardar.
    await page.getByRole("button", { name: /analizar y continuar/i }).click();

    // tras la extracción, el wizard abre en PASO 1 (clave + nombre)
    const keyInput = page.locator('input[placeholder="MIAPP"]');
    await expect(keyInput).toBeVisible({ timeout: 120000 });
    await keyInput.fill(key);
    const nm = page.locator('input[placeholder="Mi App"]');
    if (!(await nm.inputValue())) await nm.fill("VetCare");

    // paso 1 -> paso 2 (visión, debe venir PREFILLED por la IA desde el doc)
    await page.getByRole("button", { name: /continuar/i }).click();
    const visionArea = page.locator("textarea");
    await expect(visionArea).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => (await visionArea.inputValue()).length, { timeout: 15000 })
      .toBeGreaterThan(40);

    // paso 2 -> paso 3 -> crear
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: /crear proyecto/i }).click({ timeout: 15000 });

    // aterrizar en la página del proyecto
    await page.waitForURL(/\/projects\/.+/, { timeout: 45000 });
    expect(page.url()).toContain(key);
  });

  test("2. Tour guiado auto-abre y es accesible", async ({ page }) => {
    await login(page);
    // crear un proyecto libre rápido para entrar a un proyecto
    const key = `TOUR${Date.now() % 100000}`;
    await page.goto(`${F}/projects`);
    await page.getByRole("button", { name: /nuevo proyecto/i }).click();
    // modo libre / desde cero
    await page.getByText(/desde cero|en blanco|libre|describe/i).first().click().catch(() => {});
    // si abrió wizard directo, llenar; si no, intentar el flujo
    const keyInput = page.locator('input[placeholder="MIAPP"]');
    await expect(keyInput).toBeVisible({ timeout: 15000 });
    await keyInput.fill(key);
    await page.locator('input[placeholder="Mi App"]').fill("Tour Demo");
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.locator("textarea").first().fill(
      "Una app de notas colaborativas donde equipos crean, comparten y organizan notas por proyecto con etiquetas y búsqueda."
    );
    await page.getByRole("button", { name: /continuar/i }).click();
    await page.getByRole("button", { name: /crear proyecto/i }).click();
    await page.waitForURL(/\/projects\/.+/, { timeout: 45000 });

    // el tour debe auto-abrir (role dialog, aria-modal)
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    // contador de pasos visible
    await expect(page.getByText(/Tour ·\s*1\//)).toBeVisible();
    // navegar con el botón Siguiente
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText(/Tour ·\s*2\//)).toBeVisible();
    // navegar con teclado (flecha derecha)
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/Tour ·\s*3\//)).toBeVisible();
    // cerrar con Escape
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 4000 });

    // reabrir con el botón "Tour guiado"
    await page.getByRole("button", { name: /tour guiado/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });
  });

  test("3. Tab Despliegue renderiza el panel", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
    await login(page);
    await page.goto(`${F}/projects`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    // entrar al primer proyecto de la lista
    const firstProject = page.locator('a[href*="/projects/"]').first();
    await firstProject.click();
    await page.waitForURL(/\/projects\/.+/, { timeout: 20000 });
    // cerrar tour si aparece
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto(page.url().split("?")[0] + "?tab=deploy");
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/Despliegue|Publica|desplegar|GitHub|Vercel/i);
    expect(errs, errs.join(" | ")).toHaveLength(0);
  });
});
