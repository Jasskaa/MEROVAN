import { expect, test } from "@playwright/test";

// The shop runs against the real catalogue, which may be empty: flows that need a product use the
// first published one and are skipped (not failed) while there is none.

test("la portada carga con cabeceras de seguridad", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
  expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { name: "Todos los productos" })).toBeVisible();
});

test("ficha → carrito: añadir, ver total y vaciar", async ({ page }) => {
  await page.goto("/");
  const hrefs = [...new Set(await page.locator('a[href^="/p/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))];
  // The first published product that can actually be bought (with stock).
  let buyable = false;
  for (const href of hrefs) {
    await page.goto(href);
    if (await page.getByRole("button", { name: /Añadir al carrito/ }).count()) { buyable = true; break; }
  }
  test.skip(!buyable, "No hay productos publicados con stock");
  const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  await expect(page.getByText("Seguridad del producto")).toBeVisible();
  await page.getByRole("button", { name: /Añadir al carrito/ }).first().click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByText(/^Total \d+,\d{2} €$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Carrito, 1 productos/ })).toBeVisible();

  await page.getByLabel(`Cantidad de ${name}`).fill("0");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
});

test("un producto que no existe o no está publicado da 404", async ({ page }) => {
  const res = await page.goto("/p/producto-que-no-existe");
  expect(res?.status()).toBe(404);
});

test("páginas legales enlazadas desde el pie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Envíos y devoluciones" }).click();
  await expect(page.getByRole("heading", { name: "Envíos y devoluciones" })).toBeVisible();
});
