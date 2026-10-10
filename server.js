import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const timeZone = 'America/Santiago';
const sessionLifetime = 8 * 60 * 60 * 1000;

export function chileToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function makeState() {
  const passwordSalt = randomBytes(16);
  const passwordHash = scryptSync('Demo2026!', passwordSalt, 64);
  const users = [
    { id: 'c1', role: 'client', name: 'Camila Torres', email: 'cliente@demo.cl', renewalAmount: 480000 },
    { id: 'c2', role: 'client', name: 'Matías González', email: 'matias@demo.cl', renewalAmount: 650000 },
    { id: 'c3', role: 'client', name: 'Valentina Rojas', email: 'valentina@demo.cl', renewalAmount: 320000 },
    { id: 'c4', role: 'client', name: 'Nicolás Soto', email: 'nicolas@demo.cl', renewalAmount: 850000 },
    { id: 'a1', role: 'admin', name: 'Erick Zurita', email: 'admin@demo.cl' },
  ].map(user => ({ ...user, passwordSalt, passwordHash }));
  const today = chileToday();
  const days = Array.from({ length: 90 }, (_, i) => {
    const date = addDays(today, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return { date, enabled: weekday !== 0 && weekday !== 6, capacity: 2500000 };
  });
  const availableDates = days.filter(day => day.enabled).map(day => day.date);
  const requests = [
    { id: 'r1', userId: 'c2', date: availableDates[1], amount: 650000, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null },
    { id: 'r2', userId: 'c3', date: availableDates[2], amount: 320000, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null },
    { id: 'r3', userId: 'c4', date: availableDates[1], amount: 850000, status: 'approved', createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString() },
    { id: 'r4', userId: 'c1', date: addDays(today, -7), amount: 480000, status: 'approved', createdAt: new Date(Date.now() - 8 * 86400000).toISOString(), resolvedAt: new Date(Date.now() - 7 * 86400000).toISOString() },
    { id: 'r5', userId: 'c1', date: addDays(today, -15), amount: 480000, status: 'rejected', createdAt: new Date(Date.now() - 17 * 86400000).toISOString(), resolvedAt: new Date(Date.now() - 16 * 86400000).toISOString() },
  ];
  const notifications = requests.filter(request => request.status === 'pending').map((request, i) => ({ id: `n${i}`, requestId: request.id, clientName: users.find(user => user.id === request.userId).name, date: request.date, createdAt: request.createdAt, read: false }));
  return { users, days, requests, notifications, sessions: new Map(), attempts: new Map() };
}

const identity = user => ({ id: user.id, role: user.role, name: user.name, email: user.email });
const clientRequest = request => ({ id: request.id, date: request.date, status: request.status, createdAt: request.createdAt, resolvedAt: request.resolvedAt });
const approvedOn = (state, date) => state.requests.filter(request => request.date === date && request.status === 'approved').reduce((sum, request) => sum + request.amount, 0);
const remainingOn = (state, day) => day.capacity - approvedOn(state, day.date);
const canRequest = (state, day, user) => day.enabled && day.date >= chileToday() && remainingOn(state, day) >= user.renewalAmount;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Envía los datos en formato JSON.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 8192) throw new ApiError(413, 'La solicitud es demasiado grande.');
  }
  try {
    const result = JSON.parse(body || '{}');
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid object');
    return result;
  } catch { throw new ApiError(400, 'Los datos enviados no son válidos.'); }
}

export function createApp() {
  const state = makeState();
  const server = http.createServer(async (req, res) => {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      res.end(JSON.stringify(data));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (!pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, 'Método no permitido.');
        const assets = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg' };
        const asset = assets[pathname];
        if (!asset) throw new ApiError(404, 'Página no encontrada.');
        const content = await readFile(path.join(publicRoot, asset));
        const type = asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : content);
        return;
      }
      if (!['GET', 'POST', 'PUT'].includes(req.method)) throw new ApiError(405, 'Método no permitido.');
      if (req.method !== 'GET') {
        // A custom header and JSON body prevent cross-origin form submissions.
        if (req.headers['x-requested-with'] !== 'Renueva') throw new ApiError(403, 'Origen de solicitud no permitido.');
        if (req.headers.origin) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { throw new ApiError(403, 'Origen de solicitud no permitido.'); }
          if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) throw new ApiError(403, 'Origen de solicitud no permitido.');
        }
      }
      const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
      const cookie = value => `renueva_session=${value}; Path=/; HttpOnly; SameSite=Strict${secure}`;
      if (pathname === '/api/login' && req.method === 'POST') {
        const input = await readJson(req);
        const address = req.socket.remoteAddress;
        const attempt = state.attempts.get(address);
        if (attempt && attempt.expires > Date.now() && attempt.count >= 20) throw new ApiError(429, 'Demasiados intentos. Espera un minuto e inténtalo nuevamente.');
        const user = state.users.find(candidate => candidate.email === String(input.email || '').trim().toLowerCase());
        const candidate = scryptSync(String(input.password || ''), user?.passwordSalt || Buffer.alloc(16), 64);
        if (!user || !timingSafeEqual(candidate, user.passwordHash)) {
          state.attempts.set(address, { count: attempt?.expires > Date.now() ? attempt.count + 1 : 1, expires: attempt?.expires > Date.now() ? attempt.expires : Date.now() + 60000 });
          throw new ApiError(401, 'Correo o contraseña incorrectos.');
        }
        state.attempts.delete(address);
        const previous = req.headers.cookie?.match(/(?:^|;\s*)renueva_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (previous) state.sessions.delete(previous);
        const token = randomBytes(32).toString('hex');
        for (const [key, session] of state.sessions) if (session.expires < Date.now()) state.sessions.delete(key);
        state.sessions.set(token, { userId: user.id, expires: Date.now() + sessionLifetime });
        send(200, { user: identity(user) }, { 'Set-Cookie': `${cookie(token)}; Max-Age=${sessionLifetime / 1000}` });
        return;
      }
      const token = req.headers.cookie?.match(/(?:^|;\s*)renueva_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const session = state.sessions.get(token);
      if (!session || session.expires <= Date.now()) {
        if (token) state.sessions.delete(token);
        throw new ApiError(401, 'Inicia sesión para continuar.');
      }
      const user = state.users.find(candidate => candidate.id === session.userId);
      if (pathname === '/api/logout' && req.method === 'POST') {
        state.sessions.delete(token);
        send(200, { ok: true }, { 'Set-Cookie': `${cookie('')}; Max-Age=0` });
        return;
      }
      if (pathname === '/api/session' && req.method === 'GET') { send(200, { user: identity(user) }); return; }
      if (pathname.startsWith('/api/admin/') && user.role !== 'admin') throw new ApiError(403, 'No tienes permiso para acceder a esta sección.');
      if (pathname.startsWith('/api/client/') && user.role !== 'client') throw new ApiError(403, 'Esta sección es exclusiva para clientes.');
      if (pathname === '/api/client/dashboard' && req.method === 'GET') {
        send(200, { today: chileToday(), user: identity(user), days: state.days.map(day => ({ date: day.date, available: canRequest(state, day, user) })), requests: state.requests.filter(request => request.userId === user.id).map(clientRequest) });
        return;
      }
      if (pathname === '/api/client/requests' && req.method === 'POST') {
        const input = await readJson(req);
        if (Object.keys(input).some(key => key !== 'date')) throw new ApiError(400, 'Solo debes indicar la fecha de renovación.');
        const day = state.days.find(candidate => candidate.date === input.date);
        if (!day || !canRequest(state, day, user)) throw new ApiError(409, 'La fecha ya no está disponible. Elige otro día.');
        if (state.requests.some(request => request.userId === user.id && request.status === 'pending')) throw new ApiError(409, 'Ya tienes una solicitud pendiente. Espera su resolución.');
        if (state.requests.some(request => request.userId === user.id && request.date === input.date && request.status === 'approved')) throw new ApiError(409, 'Ya tienes una renovación aprobada para este día.');
        const request = { id: randomBytes(8).toString('hex'), userId: user.id, date: input.date, amount: user.renewalAmount, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null };
        state.requests.push(request);
        state.notifications.unshift({ id: randomBytes(8).toString('hex'), requestId: request.id, clientName: user.name, date: request.date, createdAt: request.createdAt, read: false });
        send(201, { request: clientRequest(request) });
        return;
      }
      if (pathname === '/api/admin/dashboard' && req.method === 'GET') {
        send(200, {
          today: chileToday(), user: identity(user),
          days: state.days.map(day => ({ ...day, used: approvedOn(state, day.date), remaining: remainingOn(state, day) })),
          requests: state.requests.map(request => ({ ...request, client: identity(state.users.find(candidate => candidate.id === request.userId)) })),
          notifications: state.notifications.slice(0, 50), unreadCount: state.notifications.filter(notification => !notification.read).length,
        });
        return;
      }
      if (pathname === '/api/admin/notifications/read' && req.method === 'POST') {
        state.notifications.forEach(notification => { notification.read = true; });
        send(200, { ok: true }); return;
      }
      if (pathname.startsWith('/api/admin/days/') && req.method === 'PUT') {
        const date = pathname.slice('/api/admin/days/'.length);
        const day = state.days.find(candidate => candidate.date === date);
        if (!day || date < chileToday()) throw new ApiError(404, 'La fecha no puede configurarse.');
        const input = await readJson(req);
        if (typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.capacity) || input.capacity < 0 || input.capacity > 1000000000) throw new ApiError(400, 'Ingresa un cupo entero válido entre $0 y $1.000.000.000.');
        if (input.capacity < approvedOn(state, date)) throw new ApiError(409, 'El cupo no puede ser menor al monto ya aprobado para este día.');
        day.enabled = input.enabled;
        day.capacity = input.capacity;
        send(200, { day: { ...day, used: approvedOn(state, date), remaining: remainingOn(state, day) } }); return;
      }
      const decisionMatch = pathname.match(/^\/api\/admin\/requests\/([a-zA-Z0-9]+)\/decision$/);
      if (decisionMatch && req.method === 'POST') {
        const input = await readJson(req);
        if (!['approved', 'rejected'].includes(input.status)) throw new ApiError(400, 'Selecciona aprobar o rechazar.');
        const request = state.requests.find(candidate => candidate.id === decisionMatch[1]);
        if (!request) throw new ApiError(404, 'Solicitud no encontrada.');
        if (request.status !== 'pending') throw new ApiError(409, 'Esta solicitud ya fue resuelta.');
        if (input.status === 'approved') {
          const day = state.days.find(candidate => candidate.date === request.date);
          if (!day || !day.enabled || day.date < chileToday()) throw new ApiError(409, 'Habilita una fecha vigente antes de aprobar.');
          if (remainingOn(state, day) < request.amount) throw new ApiError(409, 'El cupo disponible no alcanza para aprobar esta renovación.');
        }
        // No await between checking capacity and committing: atomic within this single-process demo.
        request.status = input.status;
        request.resolvedAt = new Date().toISOString();
        send(200, { request: { ...request, client: identity(state.users.find(candidate => candidate.id === request.userId)) } }); return;
      }
      throw new ApiError(404, 'Ruta no encontrada.');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Error de servidor:', error.message);
      if (!res.headersSent) send(error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'No pudimos completar la operación. Inténtalo nuevamente.' });
      else res.end();
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`Renueva · servidor de demostración en ${host}:${port}`));
}
