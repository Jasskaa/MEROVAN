import { expect, test } from "@playwright/test";

test("el panel exige iniciar sesión", async ({ page }) => {
  await page.goto("/admin/dinero");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Panel MEROVAN" })).toBeVisible();
});

test("el alta inicial se cierra cuando ya existe un owner", async ({ page }) => {
  await page.goto("/alta-inicial");
  await expect(page).toHaveURL(/\/login$/);
});

test("el login rechaza credenciales incorrectas", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("nadie@example.com");
  await page.getByLabel("Contraseña").fill("contraseña-incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText(/Correo o contraseña incorrectos|Demasiados intentos/)).toBeVisible();
});

test("la tarea diaria y el webhook no aceptan peticiones sin firma", async ({ request }) => {
  expect((await request.get("/api/cron/diario")).status()).toBe(401);
  const hook = await request.post("/api/stripe/webhook", { data: "{}" });
  expect([400, 503]).toContain(hook.status());
});

test("las exportaciones no son accesibles sin sesión", async ({ request }) => {
  const res = await request.get("/admin/dinero/exportar?tipo=ventas", { maxRedirects: 0 });
  expect([302, 303, 307, 403]).toContain(res.status());
});
