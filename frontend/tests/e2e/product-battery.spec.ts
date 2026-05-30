/**
 * BATERÍA DE TIPOS DE PRODUCTO — desde la INTERFAZ FINAL (navegador real).
 *
 * Por cada tipo de producto distinto, vía la UI:
 *   login -> Nuevo proyecto -> Describir libre -> wizard (clave/nombre/visión)
 *   -> Crear -> en la página del proyecto, generar el software -> esperar a que
 *   el toast/estado llegue a "completado" -> validar en el tab Código que hay
 *   archivos coherentes con el tipo, sin errores JS en consola.
 *
 * Valida calidad + soluciones a la medida (cada tipo genera lo suyo, no lo mismo).
 */
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
const EMAIL = "e2e@scrumdev.ai";
const PASSWORD = "e2e-pass-2026";

// La generación con Claude tarda ~6-8 min; damos margen amplio por proyecto.
const GEN_TIMEOUT = 15 * 60 * 1000;

type Case = {
  key: string;
  name: string;
  vision: string;
  // señales que DEBEN aparecer en el código generado (coherencia con el tipo)
  expectFiles: RegExp[];
};

const CASES: Case[] = [
  {
    key: "BATCRM",
    name: "CRM Ventas",
    vision:
      "Software CRM para gestionar clientes, oportunidades de venta y actividades de un equipo comercial. Necesito registrar clientes, dar seguimiento a negociaciones por etapa (pipeline), agendar actividades y ver un tablero con métricas de ventas. Roles: vendedor y gerente comercial.",
    expectFiles: [/frontend\//, /backend\//],
  },
  {
    key: "BATBOOKING",
    name: "Reservas Salón",
    vision:
      "Sistema de reservas para un salón de belleza. Los clientes reservan citas con un profesional para un servicio en una fecha y hora; el salón gestiona disponibilidad, servicios, profesionales y el calendario de citas. Roles: recepción y administrador.",
    expectFiles: [/frontend\//, /backend\//],
  },
  {
    key: "BATLANDING",
    name: "Landing Cafetería",
    vision:
      "Una landing page informativa para una cafetería de especialidad llamada Aroma. Sitio estático de marketing: hero con foto y llamado a la acción, sección de menú destacado, historia de la marca, testimonios y ubicación con horario. NO necesita login ni base de datos, es puramente informativo.",
    expectFiles: [/frontend\//],
  },
  {
    key: "BATDASH",
    name: "Dashboard Finanzas",
    vision:
      "Un dashboard de analítica financiera para una PYME. Muestra KPIs (ingresos, gastos, flujo de caja), gráficos de tendencia mensual, y una tabla de transacciones recientes con filtros. Enfocado en visualización de datos para la toma de decisiones del dueño.",
    expectFiles: [/frontend\//],
  },
];

async function login(page: Page) {
  await page.goto(`${FRONTEND}/login`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/projects/, { timeout: 20_000 });
}

async function createViaUI(page: Page, c: Case) {
  await page.goto(`${FRONTEND}/projects`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  // Abrir modal de creación
  await page.getByRole("button", { name: /nuevo proyecto/i }).first().click();
  await page.waitForTimeout(500);
  // "Describir libre" -> cierra el modal y abre el wizard directamente (visión vacía)
  await page.getByText(/describir libre/i).first().click();
  await page.waitForTimeout(800);

  // Wizard paso 1: clave + nombre
  const keyInput = page.locator('input[placeholder="MIAPP"]');
  await expect(keyInput, "wizard paso 1 (clave)").toBeVisible({ timeout: 10_000 });
  await keyInput.fill(c.key);
  await page.locator('input[placeholder="Mi App"]').fill(c.name);
  await page.getByRole("button", { name: /continuar/i }).first().click();
  await page.waitForTimeout(600);

  // Wizard paso 2: visión (textarea) — la escribimos nosotros
  const visionArea = page.locator("textarea").first();
  await expect(visionArea, "wizard paso 2 (visión)").toBeVisible({ timeout: 10_000 });
  await visionArea.fill(c.vision);
  await page.getByRole("button", { name: /continuar/i }).first().click();
  await page.waitForTimeout(600);

  // Wizard paso 3: confirmar -> Crear proyecto
  await page.getByRole("button", { name: /crear proyecto/i }).first().click();
  await page.waitForURL(new RegExp(`/projects/${c.key}`), { timeout: 20_000 });
}

const API = process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8080";

async function codeFiles(page: Page, key: string): Promise<string[]> {
  // fuente de verdad: la API del proyecto (qué se generó realmente)
  const res = await page.request.get(`${API}/projects/${key}/code`);
  if (!res.ok()) return [];
  const data = await res.json();
  const arts = Array.isArray(data) ? data : data.files || [];
  return arts.map((a: { file_path?: string; path?: string }) => a.file_path || a.path || "");
}

async function generateAndWait(page: Page, c: Case) {
  // Lanzar la generación del software desde la UI (Overview)
  await page.goto(`${FRONTEND}/projects/${c.key}`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  const genBtn = page
    .getByRole("button", { name: /generar (el )?(sistema|software|app|c[oó]digo)|construir|smart/i })
    .first();
  await expect(genBtn, "debe haber botón de generar en Overview").toBeVisible({ timeout: 10_000 });
  await genBtn.click();
  await page.waitForTimeout(1500);
  const confirm = page.getByRole("button", { name: /confirmar|s[ií]|generar/i }).first();
  if (await confirm.count()) await confirm.click().catch(() => {});

  // Esperar a que la API reporte código generado (fuente de verdad, robusto)
  const deadline = Date.now() + GEN_TIMEOUT;
  let files: string[] = [];
  while (Date.now() < deadline) {
    files = await codeFiles(page, c.key);
    if (files.length >= 5) break;
    await page.waitForTimeout(15_000);
  }
  return files;
}

test.describe("Batería de tipos de producto (UI real)", () => {
  test.describe.configure({ timeout: GEN_TIMEOUT + 5 * 60 * 1000 });

  for (const c of CASES) {
    test(`Tipo: ${c.name} (${c.key})`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on("console", (m: ConsoleMessage) => {
        if (m.type() !== "error") return;
        const t = m.text();
        if (/HMR|Download the React|Failed to load resource|404|ERR_BLOCKED/.test(t)) return;
        jsErrors.push(t.slice(0, 160));
      });
      page.on("pageerror", (e) => jsErrors.push(`pageerror: ${e.message.slice(0, 160)}`));

      await login(page);

      // Reutilizar si ya está generado (no regenerar en re-runs)
      let files = await codeFiles(page, c.key);
      if (files.length < 5) {
        await createViaUI(page, c);
        files = await generateAndWait(page, c);
      }

      // 1) generó código
      expect(files.length, `${c.key}: debe generar archivos`).toBeGreaterThanOrEqual(5);
      // 2) coherente con el tipo (frontend siempre; backend según el caso)
      const joined = files.join("\n");
      for (const re of c.expectFiles) {
        expect(joined, `${c.key}: esperaba archivos que matcheen ${re}`).toMatch(re);
      }
      // 2b) los casos sin backend NO deben tener backend (solución a la medida)
      if (!c.expectFiles.some((r) => r.source.includes("backend"))) {
        expect(files.filter((f) => f.startsWith("backend/")).length,
          `${c.key}: landing/dashboard no debería tener backend`).toBe(0);
      }
      // 3) el tab Código RENDERIZA en la UI sin errores JS
      await page.goto(`${FRONTEND}/projects/${c.key}?tab=code`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.waitForTimeout(1500);
      expect(jsErrors, `${c.key} JS errors: ${jsErrors.join(" | ")}`).toHaveLength(0);
    });
  }
});
