import { test, expect } from '@playwright/test';

async function login(page, admin = false) {
  await page.goto('/');
  await page.getByRole('button', { name: admin ? 'Administrador' : 'Soy cliente', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: admin ? 'Cada renovación, en un solo lugar.' : 'Hola, Camila' })).toBeVisible();
}
async function data(page, role) { return page.evaluate(async role => (await fetch(`/api/${role}/dashboard`)).json(), role); }

test('flujo completo: cliente solicita, administrador recibe y aprueba, cliente ve estado', async ({ browser }) => {
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const client = await clientContext.newPage();
  const admin = await adminContext.newPage();
  const errors = [];
  client.on('pageerror', error => errors.push(error.message));
  admin.on('pageerror', error => errors.push(error.message));
  await login(client);
  await login(admin, true);
  const clientData = await data(client, 'client');
  const date = clientData.days.find(day => day.available).date;
  await client.locator(`[data-date="${date}"]`).click();
  await client.getByRole('button', { name: 'Solicitar renovación', exact: true }).click();
  await expect(client.getByRole('dialog')).toBeVisible();
  await client.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(client.getByText('Ya estamos un paso más cerca.')).toBeVisible();
  const created = (await data(client, 'client')).requests.find(request => request.status === 'pending');
  await admin.reload();
  await expect(admin.getByRole('button', { name: /Notificaciones, 3 sin leer/ })).toBeVisible();
  await admin.getByRole('button', { name: /Notificaciones/ }).click();
  await expect(admin.getByRole('region', { name: 'Notificaciones' })).toContainText('Camila Torres');
  await admin.getByRole('button', { name: 'Marcar todas como leídas' }).click();
  await expect(admin.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
  await admin.getByRole('button', { name: 'Cerrar notificaciones' }).click();
  const before = (await data(admin, 'admin')).days.find(day => day.date === date);
  await admin.locator(`[data-id="${created.id}"][data-decision="approved"]`).click();
  await admin.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(admin.getByText('Renovación aprobada. El cupo del día se actualizó.')).toBeVisible();
  const after = (await data(admin, 'admin')).days.find(day => day.date === date);
  expect(after.remaining).toBe(before.remaining - 480000);
  await client.reload();
  await client.getByRole('link', { name: 'Mis solicitudes' }).click();
  const row = client.getByRole('row').filter({ hasText: created.id.slice(0, 6).toUpperCase() });
  await expect(row).toContainText('Aprobada');
  await expect(client.locator('main')).not.toContainText('$');
  await client.screenshot({ path: 'test-results/cliente-desktop.png', fullPage: true });
  await admin.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
  await clientContext.close(); await adminContext.close();
});

test('administrador configura cupo, bloquea un día, rechaza y filtra solicitudes', async ({ page }) => {
  await login(page, true);
  const dashboard = await data(page, 'admin');
  const day = dashboard.days.find(day => day.enabled && day.used === 0 && day.date > dashboard.today);
  await page.locator(`[data-date="${day.date}"]`).click();
  await page.getByLabel('Cupo total del día').fill('1900000');
  await page.getByLabel('Día habilitado').uncheck();
  await page.getByRole('button', { name: 'Guardar disponibilidad' }).click();
  await expect(page.getByText('Disponibilidad y cupo guardados.')).toBeVisible();
  const updated = (await data(page, 'admin')).days.find(item => item.date === day.date);
  expect(updated.capacity).toBe(1900000); expect(updated.enabled).toBe(false);
  await page.getByRole('link', { name: /^Solicitudes/ }).click();
  await page.getByRole('button', { name: 'Rechazar solicitud de Matías González' }).click();
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByText('Solicitud rechazada. El cupo no se modificó.')).toBeVisible();
  await page.getByRole('button', { name: /^Rechazadas/ }).click();
  await page.getByRole('searchbox').fill('matias');
  await expect(page.getByRole('row').filter({ hasText: 'Matías González' })).toContainText('Rechazada');
  await page.getByRole('searchbox').fill('no-existe');
  await expect(page.getByText('No hay solicitudes que coincidan con este filtro.')).toBeVisible();
});

test('interfaz móvil navegable sin desbordamiento y sesión restaurada al recargar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/cliente-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'Calendario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendario de renovación' })).toBeVisible();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Calendario de renovación' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenido a Renueva' })).toBeVisible();
  await login(page, true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
});

test('login inválido muestra error y un diálogo permite volver con teclado', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('cliente@demo.cl');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
  await login(page, true);
  await page.getByRole('link', { name: /^Solicitudes/ }).click();
  await page.getByRole('button', { name: /^Aprobar solicitud de/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
