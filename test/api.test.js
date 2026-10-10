import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, chileToday, addDays } from '../server.js';

let server;
let base;
beforeEach(async () => {
  server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { await new Promise(resolve => server.close(resolve)); });

async function request(route, cookie = '', method = 'GET', body, headers = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'Renueva', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
}
async function login(email = 'cliente@demo.cl') {
  const response = await request('/api/login', '', 'POST', { email, password: 'Demo2026!' });
  assert.equal(response.status, 200);
  return response.cookie.split(';')[0];
}
async function adminDay(cookie) {
  const response = await request('/api/admin/dashboard', cookie);
  return response.body.days.find(day => day.enabled && day.used === 0 && day.date > response.body.today);
}

test('calendario usa el día chileno y suma correctamente entre meses', () => {
  assert.equal(chileToday(new Date('2026-10-10T01:00:00Z')), '2026-10-09');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('rutas privadas requieren sesión y credenciales incorrectas no permiten acceso', async () => {
  assert.equal((await request('/api/client/dashboard')).status, 401);
  assert.equal((await request('/api/admin/dashboard')).status, 401);
  assert.equal((await request('/api/login', '', 'POST', { email: 'admin@demo.cl', password: 'incorrecta' })).status, 401);
});
test('sesión tiene cookie HttpOnly y SameSite, se invalida al salir', async () => {
  const result = await request('/api/login', '', 'POST', { email: 'cliente@demo.cl', password: 'Demo2026!' });
  assert.match(result.cookie, /HttpOnly/);
  assert.match(result.cookie, /SameSite=Strict/);
  const cookie = result.cookie.split(';')[0];
  assert.equal((await request('/api/session', cookie)).body.user.role, 'client');
  await request('/api/logout', cookie, 'POST', {});
  assert.equal((await request('/api/session', cookie)).status, 401);
});
test('roles separados: cliente no puede leer ni modificar administración', async () => {
  const client = await login();
  assert.equal((await request('/api/admin/dashboard', client)).status, 403);
  assert.equal((await request('/api/admin/days/2026-10-12', client, 'PUT', { enabled: true, capacity: 999999 })).status, 403);
  assert.equal((await request('/api/admin/requests/r1/decision', client, 'POST', { status: 'approved' })).status, 403);
  const admin = await login('admin@demo.cl');
  assert.equal((await request('/api/client/dashboard', admin)).status, 403);
  assert.equal((await request('/api/client/requests', admin, 'POST', { date: chileToday() })).status, 403);
});
test('todas las respuestas del cliente omiten datos financieros y otros clientes', async () => {
  const client = await login();
  const result = await request('/api/client/dashboard', client);
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body.user).sort(), ['email', 'id', 'name', 'role']);
  assert.ok(result.body.days.every(day => Object.keys(day).sort().join(',') === 'available,date'));
  assert.ok(result.body.requests.every(item => !('amount' in item) && !('userId' in item)));
  assert.doesNotMatch(JSON.stringify(result.body), /amount|capacity|remaining|renewalAmount|password|Matías|Valentina|Nicolás|matias@/);
  const day = result.body.days.find(item => item.available);
  const created = await request('/api/client/requests', client, 'POST', { date: day.date });
  assert.equal(created.status, 201);
  assert.doesNotMatch(JSON.stringify(created.body), /amount|capacity|remaining|userId/);
  const others = await login('matias@demo.cl');
  assert.ok((await request('/api/client/dashboard', others)).body.requests.every(item => item.id !== created.body.request.id));
});
test('solicitud genera notificación y no descuenta cupo hasta su aprobación', async () => {
  const admin = await login('admin@demo.cl');
  const client = await login();
  const day = await adminDay(admin);
  const created = await request('/api/client/requests', client, 'POST', { date: day.date });
  assert.equal(created.status, 201);
  const dashboard = (await request('/api/admin/dashboard', admin)).body;
  const renewal = dashboard.requests.find(item => item.id === created.body.request.id);
  assert.equal(renewal.amount, 480000);
  assert.equal(dashboard.days.find(item => item.date === day.date).remaining, day.capacity);
  assert.equal(dashboard.unreadCount, 3);
  assert.ok(dashboard.notifications.some(item => item.requestId === renewal.id && !item.read));
  await request('/api/admin/notifications/read', admin, 'POST', {});
  assert.equal((await request('/api/admin/dashboard', admin)).body.unreadCount, 0);
});
test('ignora identidad del navegador: rechaza montos o usuario inyectados', async () => {
  const client = await login();
  const dashboard = (await request('/api/client/dashboard', client)).body;
  const day = dashboard.days.find(item => item.available);
  assert.equal((await request('/api/client/requests', client, 'POST', { date: day.date, amount: 1, userId: 'c2' })).status, 400);
  assert.equal((await request('/api/client/dashboard', client)).body.requests.length, 2);
});
test('solicitudes simultáneas del mismo cliente crean solo una pendiente', async () => {
  const client = await login();
  const day = (await request('/api/client/dashboard', client)).body.days.find(item => item.available);
  const results = await Promise.all(Array.from({ length: 5 }, () => request('/api/client/requests', client, 'POST', { date: day.date })));
  assert.equal(results.filter(item => item.status === 201).length, 1);
  assert.equal(results.filter(item => item.status === 409).length, 4);
});
test('aprobaciones simultáneas de una solicitud descuentan solo una vez', async () => {
  const admin = await login('admin@demo.cl');
  const before = (await request('/api/admin/dashboard', admin)).body;
  const renewal = before.requests.find(item => item.id === 'r1');
  const day = before.days.find(item => item.date === renewal.date);
  const results = await Promise.all(Array.from({ length: 4 }, () => request('/api/admin/requests/r1/decision', admin, 'POST', { status: 'approved' })));
  assert.equal(results.filter(item => item.status === 200).length, 1);
  assert.equal(results.filter(item => item.status === 409).length, 3);
  const after = (await request('/api/admin/dashboard', admin)).body.days.find(item => item.date === day.date);
  assert.equal(after.used, day.used + renewal.amount);
  assert.equal(after.remaining, day.remaining - renewal.amount);
});
test('aprobaciones de distintos clientes nunca sobrepasan el cupo disponible', async () => {
  const admin = await login('admin@demo.cl');
  const day = await adminDay(admin);
  await request(`/api/admin/days/${day.date}`, admin, 'PUT', { enabled: true, capacity: 700000 });
  const client = await login();
  const other = await login('valentina@demo.cl');
  // Seeded pending requests are resolved before Valentina creates another.
  await request('/api/admin/requests/r2/decision', admin, 'POST', { status: 'rejected' });
  const a = await request('/api/client/requests', client, 'POST', { date: day.date });
  const b = await request('/api/client/requests', other, 'POST', { date: day.date });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const results = await Promise.all([a, b].map(item => request(`/api/admin/requests/${item.body.request.id}/decision`, admin, 'POST', { status: 'approved' })));
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
  const after = (await request('/api/admin/dashboard', admin)).body.days.find(item => item.date === day.date);
  assert.ok(after.used <= after.capacity); assert.ok(after.remaining >= 0);
});
test('cupo insuficiente deja solicitud pendiente y no filtra cifras en errores de clientes', async () => {
  const admin = await login('admin@demo.cl');
  const pending = (await request('/api/admin/dashboard', admin)).body.requests.find(item => item.id === 'r1');
  await request(`/api/admin/days/${pending.date}`, admin, 'PUT', { enabled: true, capacity: 850000 });
  assert.equal((await request('/api/admin/requests/r1/decision', admin, 'POST', { status: 'approved' })).status, 409);
  const result = (await request('/api/admin/dashboard', admin)).body;
  assert.equal(result.requests.find(item => item.id === 'r1').status, 'pending');
  assert.equal(result.days.find(item => item.date === pending.date).used, 850000);
  const client = await login();
  const denied = await request('/api/client/requests', client, 'POST', { date: pending.date });
  assert.equal(denied.status, 409);
  assert.doesNotMatch(JSON.stringify(denied.body), /850000|650000|480000|amount|capacity/);
});
test('rechazar no descuenta cupo y solicitudes resueltas no se pueden modificar', async () => {
  const admin = await login('admin@demo.cl');
  const before = (await request('/api/admin/dashboard', admin)).body;
  assert.equal((await request('/api/admin/requests/r1/decision', admin, 'POST', { status: 'rejected' })).status, 200);
  assert.equal((await request('/api/admin/requests/r1/decision', admin, 'POST', { status: 'approved' })).status, 409);
  const after = (await request('/api/admin/dashboard', admin)).body;
  assert.deepEqual(after.days, before.days);
});
test('disponibilidad protege montos aprobados y no permite fechas bloqueadas', async () => {
  const admin = await login('admin@demo.cl');
  const data = (await request('/api/admin/dashboard', admin)).body;
  const usedDay = data.days.find(item => item.used > 0);
  assert.equal((await request(`/api/admin/days/${usedDay.date}`, admin, 'PUT', { enabled: true, capacity: usedDay.used - 1 })).status, 409);
  const day = await adminDay(admin);
  assert.equal((await request(`/api/admin/days/${day.date}`, admin, 'PUT', { enabled: false, capacity: 1000000 })).status, 200);
  const client = await login();
  assert.equal((await request('/api/client/dashboard', client)).body.days.find(item => item.date === day.date).available, false);
  assert.equal((await request('/api/client/requests', client, 'POST', { date: day.date })).status, 409);
  assert.equal((await request('/api/client/requests', client, 'POST', { date: addDays(chileToday(), -1) })).status, 409);
});
test('validación rechaza cupos inválidos y JSON malformado', async () => {
  const admin = await login('admin@demo.cl');
  const day = await adminDay(admin);
  for (const capacity of [-1, 0.5, '2500000', 1000000001]) assert.equal((await request(`/api/admin/days/${day.date}`, admin, 'PUT', { enabled: true, capacity })).status, 400);
  assert.equal((await request(`/api/admin/days/${day.date}`, admin, 'PUT', null)).status, 400);
  const badJson = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Renueva' }, body: '{' });
  assert.equal(badJson.status, 400);
});
test('protección de origen y archivos privados', async () => {
  const admin = await login('admin@demo.cl');
  assert.equal((await request('/api/logout', admin, 'POST', {}, { Origin: 'https://otro-sitio.cl' })).status, 403);
  assert.equal((await request('/api/logout', admin, 'POST', {}, { 'X-Requested-With': '' })).status, 403);
  for (const file of ['/server.js', '/package.json', '/.git/config', '/test/api.test.js']) assert.equal((await request(file)).status, 404);
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /lang="es-CL"/);
  assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
});
