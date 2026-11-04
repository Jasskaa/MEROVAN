import { expect, test } from "@playwright/test";

test("la portada muestra productos publicados y cabeceras de seguridad", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
  expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Organizador de cables/ })).toBeVisible();
});

test("ficha → carrito: añadir, ver total y vaciar", async ({ page }) => {
  await page.goto("/p/organizador-de-cables");
  await expect(page.getByRole("heading", { name: "Organizador de cables" })).toBeVisible();
  await expect(page.getByText("Seguridad del producto (GPSR)")).toBeVisible();
  await page.getByRole("button", { name: "Añadir al carrito" }).click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByText("Total 19,95 €")).toBeVisible();
  await expect(page.getByRole("link", { name: /Carrito \(1\)/ })).toBeVisible();

  await page.getByLabel("Cantidad de Organizador de cables").fill("0");
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
});

test("un producto no publicado no existe en la tienda", async ({ page }) => {
  const res = await page.goto("/p/lampara-de-lectura");
  expect(res?.status()).toBe(404);
});

test("páginas legales enlazadas desde el pie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Envíos y devoluciones" }).click();
  await expect(page.getByRole("heading", { name: "Envíos y devoluciones" })).toBeVisible();
});
