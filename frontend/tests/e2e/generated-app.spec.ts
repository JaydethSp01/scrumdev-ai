/** Verifica que la APP GENERADA realmente CORRE en el navegador (no crashea
 *  client-side) y no pide login de Vercel. */
import { test, expect } from "@playwright/test";

const URL = "https://flow57556-web.vercel.app";

test.use({ viewport: { width: 1280, height: 800 } });

test("la app generada corre sin client-side exception ni login Vercel", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(URL, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(4000); // dar tiempo a fetch+hidratación
  const body = await page.locator("body").innerText();
  // NO debe mostrar el error de Next ni el login de Vercel
  expect(body, "muestra Application error").not.toContain("Application error");
  expect(body, "muestra client-side exception").not.toContain("client-side exception");
  expect(body.toLowerCase(), "pide login Vercel").not.toContain("authenticating");
  // debe haber contenido real renderizado
  expect(body.trim().length, "página vacía").toBeGreaterThan(40);
  console.log("BODY (primeros 300):", body.slice(0, 300).replace(/\n+/g, " | "));
  console.log("pageerrors:", errors.length ? errors.join(" || ") : "ninguno");
});
