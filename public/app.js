const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');
const state = { user: null, data: null, view: 'inicio', month: '', selected: null, filter: 'pending', search: '', mobileNav: false, busy: false, notifications: false };
let refreshTimer;
let modalReturnFocus;

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  logout: '<path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M9 12h12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  wallet: '<path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7M21 12h-6v5h6M17 14.5h.01"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
const dateLabel = (value, options = {}) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC', ...options }).format(new Date(`${value}T12:00:00Z`));
const shortDate = value => dateLabel(value, { month: 'short' });
const initials = name => name.split(' ').map(word => word[0]).slice(0, 2).join('');
const isAdmin = () => state.user?.role === 'admin';
const statusLabel = status => ({ pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }[status]);
const badge = status => `<span class="badge ${status}"><span></span>${statusLabel(status)}</span>`;
const brand = () => `<span class="brand-mark">r<span>${icon('arrow')}</span></span><span class="brand-name">renueva<span>.</span></span>`;

async function api(route, method = 'GET', body) {
  const response = await fetch(route, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Renueva' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'No pudimos completar la operación.');
    error.status = response.status;
    if (response.status === 401 && route !== '/api/login') {
      clearInterval(refreshTimer); state.user = null; state.data = null; closeModal(); renderLogin();
    }
    throw error;
  }
  return result;
}

function toast(message, error = false) {
  const item = document.createElement('div');
  item.className = `toast ${error ? 'toast-error' : ''}`;
  item.setAttribute('role', error ? 'alert' : 'status');
  item.innerHTML = `${icon(error ? 'info' : 'check')}<span>${escape(message)}</span>`;
  toastRoot.append(item);
  setTimeout(() => item.remove(), 6500);
}

function renderLogin() {
  app.innerHTML = `<main class="login-layout">
    <section class="login-story">
      <a class="brand login-brand" href="#">${brand()}</a>
      <div class="story-content"><span class="eyebrow light">MÁS SIMPLE. MÁS CERCA.</span><h1>Tu próximo paso,<br>con tranquilidad<span>.</span></h1><p>Solicita tu renovación y sigue cada paso.<br>Todo en un solo lugar, a tu ritmo.</p>
        <div class="story-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-card"><span class="art-icon">${icon('calendar')}</span><span>Tu próxima renovación</span><strong>Todo comienza<br>con una fecha.</strong><div class="art-days"><i>L</i><i>M</i><i>M</i><i>J</i><i>V</i><b>12</b><b>13</b><b>14</b><b class="active">15</b><b>16</b></div></div><div class="art-approved">${icon('check')} Un paso más cerca</div><div class="art-spark">${icon('spark')}</div></div>
      </div><div class="story-footer">Hecho para acompañarte <span>Chile · CL</span></div>
    </section>
    <section class="login-panel"><div class="login-box"><span class="demo-pill"><span></span>PROTOTIPO · DATOS FICTICIOS</span><h2>Bienvenido a Renueva</h2><p class="muted">Ingresa para gestionar tus renovaciones.</p>
      <form id="login-form"><label for="email">Correo electrónico</label><div class="input-icon">${icon('mail')}<input id="email" name="email" type="email" autocomplete="username" placeholder="tu.correo@ejemplo.cl" required maxlength="254"></div><label for="password">Contraseña</label><div class="input-icon">${icon('lock')}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Ingresa tu contraseña" required maxlength="128"><button class="password-toggle" type="button" data-action="password" aria-label="Mostrar contraseña">${icon('eye')}</button></div><p id="login-error" class="form-error" role="alert"></p><button class="button primary login-submit" type="submit">Iniciar sesión ${icon('arrow')}</button></form>
      <div class="demo-access"><div class="section-label">EXPLORA LA DEMOSTRACIÓN</div><p>Usa una cuenta ficticia para conocer cada panel.</p><div class="demo-buttons"><button class="button secondary" data-action="demo-client">${icon('user')} Soy cliente</button><button class="button secondary" data-action="demo-admin">${icon('shield')} Administrador</button></div><small>Contraseña de ambas cuentas: <strong>Demo2026!</strong></small></div><div class="login-note">${icon('lock')} Acceso exclusivo para clientes existentes.<br>No hay registro público.</div>
    </div><footer class="login-footer">© ${new Date().getFullYear()} Renueva <span>Prototipo sin pagos ni transferencias</span></footer></section>
  </main>`;
}

function setView(view) {
  if (!['inicio', 'calendario', 'solicitudes'].includes(view)) view = 'inicio';
  state.view = view; state.mobileNav = false; state.notifications = false;
  if (location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  render();
}

async function loadDashboard(renderPage = true) {
  const data = await api(`/api/${isAdmin() ? 'admin' : 'client'}/dashboard`);
  const changed = JSON.stringify(data) !== JSON.stringify(state.data);
  const previousUnread = state.data?.unreadCount;
  state.data = data;
  if (!state.month) state.month = `${data.today.slice(0, 7)}-01`;
  if (isAdmin() && !state.selected) state.selected = data.days.find(day => day.enabled)?.date || data.today;
  if (previousUnread !== undefined && data.unreadCount > previousUnread) toast('Recibiste una nueva solicitud de renovación.');
  if (renderPage || changed) render();
}

async function enter(user) {
  state.user = user; state.data = null; state.selected = null; state.month = ''; state.search = ''; state.filter = 'pending';
  state.view = ['inicio', 'calendario', 'solicitudes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
  await loadDashboard();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!state.user || state.busy || modalRoot.childElementCount || document.hidden || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    loadDashboard(false).catch(error => { if (error.status !== 401) showConnectionError(); });
  }, 6000);
}

function showConnectionError() {
  if (document.querySelector('.connection-error')) return;
  const notice = document.createElement('div');
  notice.className = 'connection-error';
  notice.setAttribute('role', 'alert');
  notice.innerHTML = 'No pudimos actualizar la información. <button data-action="refresh">Reintentar</button>';
  document.querySelector('.main-content')?.prepend(notice);
}

function render() {
  if (!state.user || !state.data) return;
  const admin = isAdmin();
  const titles = admin ? { inicio: 'Vista general', calendario: 'Disponibilidad y cupos', solicitudes: 'Solicitudes de renovación' } : { inicio: 'Mi espacio', calendario: 'Calendario de renovación', solicitudes: 'Mis solicitudes' };
  const nav = [{ view: 'inicio', label: admin ? 'Vista general' : 'Mi espacio', icon: 'grid' }, { view: 'calendario', label: 'Calendario', icon: 'calendar' }, { view: 'solicitudes', label: admin ? 'Solicitudes' : 'Mis solicitudes', icon: 'file' }];
  const pending = state.data.requests.filter(request => request.status === 'pending').length;
  app.innerHTML = `<div class="app-shell ${state.mobileNav ? 'nav-open' : ''}"><button class="nav-scrim" data-action="close-nav" aria-label="Cerrar menú"></button><aside class="sidebar"><a class="brand" href="#inicio" data-view="inicio">${brand()}</a><span class="workspace-label">${admin ? 'ADMINISTRACIÓN' : 'PORTAL DEL CLIENTE'}</span><nav aria-label="Navegación principal">${nav.map(item => `<a href="#${item.view}" data-view="${item.view}" class="nav-link ${state.view === item.view ? 'active' : ''}" ${state.view === item.view ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span>${item.view === 'solicitudes' && pending ? `<span class="nav-count">${pending}</span>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="private-note">${icon('shield')}<strong>Tu espacio es privado</strong><p>${admin ? 'Los datos financieros solo están disponibles para administración.' : 'Solo tú puedes consultar tus solicitudes y su estado.'}</p></div><div class="sidebar-user"><span class="avatar">${initials(state.user.name)}</span><div><strong>${escape(state.user.name)}</strong><small>${admin ? 'Administrador' : 'Cliente'}</small></div><button class="icon-button" data-action="logout" aria-label="Cerrar sesión" title="Cerrar sesión">${icon('logout')}</button></div></div>
    </aside><div class="main-shell"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="open-nav" aria-label="Abrir menú">${icon('menu')}</button><span>${admin ? 'Administración' : 'Portal del cliente'}</span>${icon('chevron')}<strong>${titles[state.view]}</strong></div><div class="topbar-actions"><span class="environment-tag"><span></span>Modo demostración</span>${admin ? `<button class="notification-button icon-button ${state.notifications ? 'active' : ''}" data-action="notifications" aria-label="Notificaciones${state.data.unreadCount ? `, ${state.data.unreadCount} sin leer` : ''}" aria-expanded="${state.notifications}">${icon('bell')}${state.data.unreadCount ? '<i></i>' : ''}</button>` : `<span class="secure-label">${icon('shield')} Sesión privada</span>`}<span class="avatar small">${initials(state.user.name)}</span></div></header>
      ${admin && state.notifications ? notificationsPanel() : ''}<main class="main-content" id="main-content"><div class="page-heading"><div><span class="eyebrow">${admin ? 'TODO BAJO CONTROL' : 'TU PRÓXIMO PASO'}</span><h1>${state.view === 'inicio' ? admin ? 'Cada renovación, en un solo lugar.' : `Hola, ${escape(state.user.name.split(' ')[0])} <span class="wave">✦</span>` : titles[state.view]}</h1><p>${state.view === 'solicitudes' ? admin ? 'Revisa cada solicitud y decide con toda la información.' : 'Sigue el estado de tus renovaciones, sin complicaciones.' : admin ? 'Gestiona las fechas, los cupos y las solicitudes de tus clientes.' : 'Elige una fecha y nosotros te acompañamos con tu renovación.'}</p></div><span class="today-label">${icon('calendar')}${dateLabel(state.data.today, { weekday: 'short', year: 'numeric' })}</span></div>
      ${admin ? adminPage() : clientPage()}
      <footer class="page-footer"><span>Renueva · Un paso más cerca.</span><span>Datos ficticios · Zona horaria de Chile</span></footer></main></div></div>`;
}

function clientPage() {
  const pending = state.data.requests.filter(request => request.status === 'pending');
  const approved = state.data.requests.filter(request => request.status === 'approved');
  if (state.view === 'solicitudes') return clientRequests(false);
  return `${state.view === 'inicio' ? `<section class="welcome-banner"><div class="banner-icon">${icon('spark')}</div><div><span>UN PROCESO SIMPLE, A TU RITMO</span><h2>Tu renovación comienza con una fecha.</h2><p>Revisa los días disponibles, envía tu solicitud y sigue su estado aquí.</p></div><div class="banner-decoration" aria-hidden="true">${icon('arrow')}</div></section><section class="client-stats"><div class="mini-stat">${icon('file')}<div><span>Mis solicitudes</span><strong>${state.data.requests.length}</strong></div></div><div class="mini-stat">${icon('clock')}<div><span>En revisión</span><strong>${pending.length}<small>${pending.length ? 'Te avisaremos aquí' : 'Todo al día'}</small></strong></div></div><div class="mini-stat">${icon('check')}<div><span>Renovaciones aprobadas</span><strong>${approved.length}</strong></div></div></section>` : ''}
    <section class="calendar-layout">${calendar()}${clientSelection()}</section>
    ${state.view === 'inicio' ? clientRequests(true) : ''}`;
}

function adminPage() {
  if (state.view === 'solicitudes') return adminRequests(false);
  const futureDays = state.data.days.filter(day => day.date >= state.data.today && day.date.startsWith(state.month.slice(0, 7)) && day.enabled);
  const total = futureDays.reduce((sum, day) => sum + day.capacity, 0);
  const used = futureDays.reduce((sum, day) => sum + day.used, 0);
  const pending = state.data.requests.filter(request => request.status === 'pending');
  return `${state.view === 'inicio' ? `<section class="admin-stats"><div class="stat-card"><div class="stat-label">Solicitudes pendientes <span class="stat-icon amber">${icon('clock')}</span></div><strong>${pending.length.toString().padStart(2, '0')}</strong><span class="stat-foot">${pending.length ? 'Esperan tu revisión' : 'No hay solicitudes por revisar'}</span></div><div class="stat-card"><div class="stat-label">Cupo disponible del mes <span class="stat-icon green">${icon('wallet')}</span></div><strong>${money(total - used)}</strong><span class="stat-foot">Fechas habilitadas desde hoy</span></div><div class="stat-card"><div class="stat-label">Monto aprobado del mes <span class="stat-icon lavender">${icon('check')}</span></div><strong>${money(used)}</strong><span class="stat-foot">${dateLabel(state.month, { day: undefined, year: 'numeric' })}</span></div></section>` : ''}<section class="calendar-layout admin-calendar-layout">${calendar()}${adminDayEditor()}</section>${state.view === 'inicio' ? adminRequests(true) : ''}`;
}

function calendar() {
  const admin = isAdmin();
  const [year, month] = state.month.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = Math.ceil((offset + count) / 7);
  const earliest = state.data.today.slice(0, 7);
  const latest = state.data.days.at(-1).date.slice(0, 7);
  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    const number = i - offset + 1;
    if (number < 1 || number > count) return '<div class="calendar-blank" aria-hidden="true"></div>';
    const date = `${year}-${String(month).padStart(2, '0')}-${String(number).padStart(2, '0')}`;
    const day = state.data.days.find(item => item.date === date);
    const selectable = day && date >= state.data.today && (admin || day.available);
    const available = day && (admin ? day.enabled && day.remaining > 0 : day.available) && date >= state.data.today;
    const approved = !admin && state.data.requests.some(request => request.date === date && request.status === 'approved');
    const pending = !admin && state.data.requests.some(request => request.date === date && request.status === 'pending');
    return `<button class="calendar-day ${available ? 'available' : 'unavailable'} ${date === state.selected ? 'selected' : ''} ${date === state.data.today ? 'today' : ''} ${pending || approved ? 'has-request' : ''}" data-date="${date}" ${selectable ? '' : 'disabled'} aria-label="${dateLabel(date, { weekday: 'long', year: 'numeric' })}, ${available ? 'disponible' : 'no disponible'}${pending ? ', solicitud pendiente' : ''}${approved ? ', renovación aprobada' : ''}" aria-pressed="${state.selected === date}"><span>${number}</span><i class="day-dot"></i>${admin && day?.enabled ? `<small>${money(day.remaining)}</small>` : ''}</button>`;
  }).join('');
  return `<article class="card calendar-card"><div class="card-header"><div><h2>${admin ? 'Calendario de disponibilidad' : 'Elige tu fecha de renovación'}</h2><p>${admin ? 'Selecciona un día para administrar su cupo.' : 'Selecciona uno de los días disponibles.'}</p></div><span class="card-header-icon">${icon('calendar')}</span></div><div class="calendar-month"><h3>${dateLabel(state.month, { day: undefined, year: 'numeric' })}</h3><div class="month-controls"><button class="icon-button prev" data-action="prev-month" aria-label="Mes anterior" ${state.month.slice(0, 7) <= earliest ? 'disabled' : ''}>${icon('chevron')}</button><button class="today-button" data-action="today">Hoy</button><button class="icon-button" data-action="next-month" aria-label="Mes siguiente" ${state.month.slice(0, 7) >= latest ? 'disabled' : ''}>${icon('chevron')}</button></div></div><div class="calendar-weekdays">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid ${admin ? 'admin-grid' : ''}">${cells}</div><div class="calendar-legend"><span><i class="legend-dot available"></i>Disponible</span><span><i class="legend-dot unavailable"></i>No disponible</span><span><i class="legend-dot selected"></i>Seleccionado</span></div></article>`;
}

function clientSelection() {
  const pending = state.data.requests.find(request => request.status === 'pending');
  const selectedDay = state.data.days.find(day => day.date === state.selected);
  const approved = state.data.requests.some(request => request.date === state.selected && request.status === 'approved');
  const eligible = selectedDay?.available && !pending && !approved;
  return `<aside class="request-aside"><article class="card selection-card"><span class="selection-icon">${icon(pending ? 'clock' : 'calendar')}</span><span class="section-label">${pending ? 'SOLICITUD EN REVISIÓN' : 'TU NUEVA SOLICITUD'}</span><h2>${pending ? 'Ya estamos un paso más cerca.' : state.selected ? 'Una fecha para avanzar.' : '¿Cuándo quieres renovar?'}</h2><p>${pending ? 'Tu solicitud está pendiente de revisión. Su estado se actualizará aquí.' : 'Elige un día en el calendario para solicitar tu próxima renovación.'}</p><div class="selected-date"><span>${pending ? 'Fecha solicitada' : 'Fecha seleccionada'}</span><strong>${pending ? dateLabel(pending.date, { weekday: 'long' }) : state.selected ? dateLabel(state.selected, { weekday: 'long' }) : 'Aún no seleccionada'}</strong>${pending ? badge('pending') : state.selected ? '<span class="date-caption">Chile · America/Santiago</span>' : ''}</div><button class="button primary" data-action="request" ${eligible ? '' : 'disabled'}>${pending ? 'En espera de revisión' : approved ? 'Ya tienes una aprobación' : 'Solicitar renovación'}${icon(pending ? 'clock' : 'arrow')}</button><small class="selection-foot">${icon('info')} ${pending ? 'Podrás enviar otra solicitud cuando esta se resuelva.' : 'Tu solicitud quedará sujeta a aprobación.'}</small></article><article class="how-it-works"><h3>Así de simple</h3><ol><li><span>1</span><div><strong>Elige una fecha</strong><p>Busca un día disponible.</p></div></li><li><span>2</span><div><strong>Envía tu solicitud</strong><p>Nosotros nos encargamos de revisarla.</p></div></li><li><span>3</span><div><strong>Sigue su estado</strong><p>Consulta la respuesta en tu panel.</p></div></li></ol></article></aside>`;
}

function adminDayEditor() {
  const day = state.data.days.find(item => item.date === state.selected);
  if (!day) return '<aside class="card selection-card"><h2>Selecciona una fecha</h2></aside>';
  const pending = state.data.requests.filter(request => request.date === day.date && request.status === 'pending').length;
  const percent = day.capacity ? Math.min(100, Math.round(day.used / day.capacity * 100)) : 0;
  return `<aside class="card day-editor"><div class="editor-heading"><span class="section-label">CONFIGURACIÓN DEL DÍA</span>${icon('calendar')}</div><h2>${dateLabel(day.date, { weekday: 'long' })}</h2><p class="muted">${dateLabel(day.date, { day: undefined, month: undefined, year: 'numeric' })} · Hora de Chile</p><form id="day-form"><label class="switch-row" for="day-enabled"><span><strong>Día habilitado</strong><small>Permite recibir solicitudes</small></span><input class="switch" id="day-enabled" name="enabled" type="checkbox" ${day.enabled ? 'checked' : ''}></label><label for="day-capacity">Cupo total del día</label><div class="currency-input"><span>$</span><input id="day-capacity" name="capacity" type="number" min="${day.used}" max="1000000000" step="1" value="${day.capacity}" required aria-describedby="capacity-help"><span>CLP</span></div><small id="capacity-help" class="field-help">Monto entero en pesos chilenos.</small><div class="capacity-summary"><div><span>Monto aprobado</span><strong>${money(day.used)}</strong></div><div class="capacity-remaining"><span>Cupo restante</span><strong>${money(day.remaining)}</strong></div><progress value="${day.used}" max="${day.capacity || 1}" aria-label="Cupo utilizado"></progress><small>${percent}% del cupo utilizado · ${pending} ${pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</small></div><p class="form-error" id="day-error" role="alert"></p><button type="submit" class="button primary">Guardar disponibilidad ${icon('check')}</button></form><div class="editor-note">${icon('shield')}Los cupos y montos solo son visibles para administración.</div></aside>`;
}

function clientRequests(compact) {
  const requests = [...state.data.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `<section class="card requests-card"><div class="card-header"><div><h2>${compact ? 'Mis últimas solicitudes' : 'Historial de solicitudes'}</h2><p>Cada paso de tu renovación, siempre a la vista.</p></div>${compact ? '<a href="#solicitudes" data-view="solicitudes" class="text-link">Ver todas '+ icon('arrow') + '</a>' : `<span class="count-pill">${requests.length} en total</span>`}</div>${requests.length ? `<div class="table-wrap"><table class="client-table"><thead><tr><th>Solicitud</th><th>Fecha de renovación</th><th>Enviada el</th><th>Estado</th></tr></thead><tbody>${requests.slice(0, compact ? 3 : undefined).map(request => `<tr><td><span class="request-id">${icon('file')}<strong>#${escape(request.id.slice(0, 6).toUpperCase())}</strong></span></td><td data-label="Fecha de renovación">${dateLabel(request.date, { year: 'numeric' })}</td><td class="muted" data-label="Enviada el">${new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(request.createdAt))}</td><td>${badge(request.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Todavía no tienes solicitudes', 'Elige un día en el calendario para comenzar.', 'calendar')}${!compact ? '<div class="table-note">'+icon('info')+'Los estados se actualizan automáticamente mientras estás en tu panel.</div>' : ''}</section>`;
}

function emptyState(title, description, symbol = 'file') { return `<div class="empty-state"><span>${icon(symbol)}</span><h3>${title}</h3><p>${description}</p></div>`; }

function adminRequests(compact) {
  const counts = Object.fromEntries(['pending', 'approved', 'rejected'].map(status => [status, state.data.requests.filter(request => request.status === status).length]));
  return `<section class="card requests-card"><div class="card-header"><div><h2>${compact ? 'Solicitudes por revisar' : 'Todas las solicitudes'}</h2><p>${compact ? 'Una decisión para seguir avanzando.' : 'Los montos corresponden a renovaciones ficticias.'}</p></div>${compact ? '<a href="#solicitudes" data-view="solicitudes" class="text-link">Ver todas '+icon('arrow')+'</a>' : `<div class="input-icon search-box">${icon('search')}<input id="request-search" type="search" aria-label="Buscar por nombre o correo" placeholder="Buscar cliente…" value="${escape(state.search)}"></div>`}</div>${!compact ? `<div class="request-tabs" role="group" aria-label="Filtrar solicitudes">${['pending', 'approved', 'rejected', 'all'].map(filter => `<button data-filter="${filter}" class="${state.filter === filter ? 'active' : ''}" aria-pressed="${state.filter === filter}">${filter === 'all' ? 'Todas' : { pending: 'Pendientes', approved: 'Aprobadas', rejected: 'Rechazadas' }[filter]}<span>${filter === 'all' ? state.data.requests.length : counts[filter]}</span></button>`).join('')}</div>` : ''}<div id="admin-request-list">${adminRows(compact)}</div></section>`;
}

function adminRows(compact) {
  const search = state.search.toLocaleLowerCase('es');
  let requests = [...state.data.requests].filter(request => compact ? request.status === 'pending' : (state.filter === 'all' || request.status === state.filter) && `${request.client.name} ${request.client.email}`.toLocaleLowerCase('es').includes(search)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (compact) requests = requests.slice(0, 4);
  if (!requests.length) return emptyState('Todo al día por aquí', compact ? 'No hay solicitudes pendientes de revisión.' : 'No hay solicitudes que coincidan con este filtro.', 'check');
  return `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Cliente</th><th>Fecha solicitada</th><th>Monto</th><th>Estado</th><th class="actions-heading">Acciones</th></tr></thead><tbody>${requests.map(request => `<tr><td><div class="table-client"><span class="avatar ${request.userId === 'c3' ? 'peach' : request.userId === 'c2' ? 'lavender' : ''}">${initials(request.client.name)}</span><div><strong>${escape(request.client.name)}</strong><small>${escape(request.client.email)}</small></div></div></td><td data-label="Fecha solicitada">${shortDate(request.date)}<small class="table-subtext">${dateLabel(request.date, { day: undefined, month: undefined, weekday: 'long' })}</small></td><td class="amount-cell" data-label="Monto">${money(request.amount)}</td><td>${badge(request.status)}</td><td><div class="row-actions">${request.status === 'pending' ? `<button class="button approve small-button" data-decision="approved" data-id="${request.id}" aria-label="Aprobar solicitud de ${escape(request.client.name)}">${icon('check')} Aprobar</button><button class="icon-button reject-button" data-decision="rejected" data-id="${request.id}" aria-label="Rechazar solicitud de ${escape(request.client.name)}" title="Rechazar">${icon('close')}</button>` : '<span class="resolved-label">'+icon('check')+' Resuelta</span>'}</div></td></tr>`).join('')}</tbody></table></div>`;
}

function notificationsPanel() {
  const notifications = state.data.notifications;
  return `<section class="notification-panel" aria-label="Notificaciones"><div class="notification-heading"><h2>Notificaciones <span class="count-pill">${state.data.unreadCount}</span></h2><button class="icon-button" data-action="notifications" aria-label="Cerrar notificaciones">${icon('close')}</button></div>${notifications.length ? `<div class="notification-list">${notifications.map(notification => `<div class="notification-item ${notification.read ? '' : 'unread'}"><span class="notification-icon">${icon('file')}</span><div><strong>Nueva solicitud</strong><p>${escape(notification.clientName)} solicitó una renovación para el ${shortDate(notification.date)}.</p><small>${notification.read ? 'Leída' : 'Sin leer'}</small></div></div>`).join('')}</div><button class="button secondary" data-action="read-notifications" ${state.data.unreadCount ? '' : 'disabled'}>Marcar todas como leídas</button>` : emptyState('Sin novedades', 'Las nuevas solicitudes aparecerán aquí.', 'bell')}</section>`;
}

function openModal(content) {
  modalReturnFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="Cerrar diálogo">${icon('close')}</button>${content}</section></div>`;
  document.body.classList.add('modal-open');
  modalRoot.querySelector('button')?.focus();
}
function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); modalReturnFocus?.focus(); }

function requestModal() {
  if (!state.selected || !state.data.days.find(day => day.date === state.selected)?.available) return;
  openModal(`<span class="modal-icon">${icon('calendar')}</span><span class="section-label">UN PASO MÁS CERCA</span><h2 id="modal-title">Confirma tu solicitud</h2><p>Solicitaremos tu renovación para la fecha seleccionada. Podrás seguir su estado en tu panel.</p><div class="modal-detail"><span>Fecha de renovación</span><strong>${dateLabel(state.selected, { weekday: 'long', year: 'numeric' })}</strong></div><div class="inline-note">${icon('info')}Enviar esta solicitud no garantiza su aprobación.</div><p class="form-error" id="modal-error" role="alert"></p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Volver</button><button class="button primary" data-action="confirm-request">Enviar solicitud ${icon('arrow')}</button></div>`);
}

function decisionModal(id, status) {
  const request = state.data.requests.find(item => item.id === id);
  if (!request || request.status !== 'pending') return;
  const approving = status === 'approved';
  openModal(`<span class="modal-icon ${approving ? '' : 'danger'}">${icon(approving ? 'check' : 'close')}</span><span class="section-label">REVISIÓN DE SOLICITUD</span><h2 id="modal-title">${approving ? 'Aprobar' : 'Rechazar'} renovación</h2><p>${approving ? 'Se descontará el monto del cupo disponible de este día.' : 'El cliente verá su solicitud como rechazada. El cupo no se modificará.'}</p><div class="decision-details"><div><span>Cliente</span><strong>${escape(request.client.name)}</strong></div><div><span>Fecha</span><strong>${dateLabel(request.date, { year: 'numeric' })}</strong></div><div><span>Monto</span><strong>${money(request.amount)}</strong></div></div><p class="form-error" id="modal-error" role="alert"></p><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button ${approving ? 'primary' : 'danger-button'}" data-action="confirm-decision" data-id="${id}" data-status="${status}">Confirmar ${approving ? 'aprobación' : 'rechazo'}</button></div>`);
}

async function withBusy(button, action, errorTarget) {
  if (state.busy) return;
  state.busy = true;
  const previous = button.innerHTML;
  button.disabled = true; button.textContent = 'Procesando…';
  if (errorTarget) errorTarget.textContent = '';
  try { await action(); } catch (error) {
    if (errorTarget?.isConnected) errorTarget.textContent = error.message;
    else toast(error.message, true);
  } finally { state.busy = false; if (button.isConnected) { button.disabled = false; button.innerHTML = previous; } }
}

document.addEventListener('click', async event => {
  const control = event.target.closest('button, a[data-view]');
  if (!control || control.disabled) return;
  if (control.dataset.view) { event.preventDefault(); setView(control.dataset.view); return; }
  if (control.dataset.date) { state.selected = control.dataset.date; render(); return; }
  if (control.dataset.filter) { state.filter = control.dataset.filter; render(); return; }
  if (control.dataset.decision) { decisionModal(control.dataset.id, control.dataset.decision); return; }
  const action = control.dataset.action;
  if (!action) return;
  try {
    if (action === 'demo-client' || action === 'demo-admin') {
      document.querySelector('#email').value = action === 'demo-client' ? 'cliente@demo.cl' : 'admin@demo.cl';
      document.querySelector('#password').value = 'Demo2026!';
      document.querySelector('.login-submit').focus();
    } else if (action === 'password') {
      const password = document.querySelector('#password');
      password.type = password.type === 'password' ? 'text' : 'password';
      control.setAttribute('aria-label', password.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    } else if (action === 'logout') {
      await withBusy(control, async () => { await api('/api/logout', 'POST', {}); clearInterval(refreshTimer); state.user = null; state.data = null; closeModal(); history.replaceState(null, '', location.pathname); renderLogin(); });
    } else if (action === 'open-nav' || action === 'close-nav') { state.mobileNav = action === 'open-nav'; render(); }
    else if (['prev-month', 'next-month', 'today'].includes(action)) {
      if (action === 'today') state.month = `${state.data.today.slice(0, 7)}-01`;
      else { const date = new Date(`${state.month}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + (action === 'next-month' ? 1 : -1)); state.month = date.toISOString().slice(0, 10); }
      render();
    } else if (action === 'request') requestModal();
    else if (action === 'close-modal') { if (!state.busy) closeModal(); }
    else if (action === 'confirm-request') {
      await withBusy(control, async () => {
        await api('/api/client/requests', 'POST', { date: state.selected }); closeModal(); await loadDashboard(); toast('Solicitud enviada. Puedes seguir su estado en tu panel.');
      }, document.querySelector('#modal-error'));
    } else if (action === 'confirm-decision') {
      await withBusy(control, async () => {
        await api(`/api/admin/requests/${control.dataset.id}/decision`, 'POST', { status: control.dataset.status }); closeModal(); await loadDashboard(); toast(control.dataset.status === 'approved' ? 'Renovación aprobada. El cupo del día se actualizó.' : 'Solicitud rechazada. El cupo no se modificó.');
      }, document.querySelector('#modal-error'));
    } else if (action === 'notifications') { state.notifications = !state.notifications; render(); }
    else if (action === 'read-notifications') { await withBusy(control, async () => { await api('/api/admin/notifications/read', 'POST', {}); await loadDashboard(); toast('Notificaciones marcadas como leídas.'); }); }
    else if (action === 'refresh') { await loadDashboard(); }
  } catch (error) { toast(error.message, true); }
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const button = form.querySelector('[type="submit"]');
  if (form.id === 'login-form') {
    await withBusy(button, async () => { const result = await api('/api/login', 'POST', { email: values.get('email'), password: values.get('password') }); await enter(result.user); }, document.querySelector('#login-error'));
  } else if (form.id === 'day-form') {
    await withBusy(button, async () => { await api(`/api/admin/days/${state.selected}`, 'PUT', { enabled: values.get('enabled') === 'on', capacity: Number(values.get('capacity')) }); await loadDashboard(); toast('Disponibilidad y cupo guardados.'); }, document.querySelector('#day-error'));
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'request-search') { state.search = event.target.value; document.querySelector('#admin-request-list').innerHTML = adminRows(false); }
});
document.addEventListener('keydown', event => {
  if (!modalRoot.childElementCount) return;
  if (event.key === 'Escape' && !state.busy) closeModal();
  if (event.key === 'Tab') {
    const focusable = [...modalRoot.querySelectorAll('button:not(:disabled), input, a[href]')];
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.addEventListener('popstate', () => { if (state.user) setView(location.hash.slice(1)); });

try { const result = await api('/api/session'); await enter(result.user); }
catch (error) { renderLogin(); if (error.status !== 401) toast('No pudimos conectar con el servidor. Vuelve a intentarlo.', true); }
