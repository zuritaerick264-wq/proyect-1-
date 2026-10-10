# Renueva · Solicitudes de renovación en Chile

Primera versión navegable en español, con paneles separados para clientes y administración. Incluye calendarios, disponibilidad diaria, cupos en pesos chilenos, solicitudes, decisiones y notificaciones. Todos los nombres, correos y montos son ficticios. No hay pagos, transferencias ni registro público.

## Ejecutar

Necesitas **Node.js 22 o superior** y npm. Desde la carpeta del proyecto:

```bash
npm ci
npm run dev
```

Abre `http://localhost:3000` en tu equipo. El servidor de desarrollo se reinicia al cambiar sus archivos. También puedes iniciar sin vigilancia de archivos con `npm start`. La interfaz se sirve directamente: no requiere compilación ni servicios externos.

En el entorno en la nube, la ruta del proyecto es `/workspace/proyect-1-`. Si npm no puede escribir en su caché predeterminada, usa:

```bash
npm ci --cache /tmp/renueva-npm-cache
```

El servidor escucha en `127.0.0.1` por defecto. Para acceder desde otro dispositivo de tu red de pruebas, ejecuta `HOST=0.0.0.0 npm run dev`; ese dispositivo debe poder alcanzar el computador y el puerto 3000. `PORT` permite cambiar el puerto. Esta demostración tiene credenciales públicas y debe permanecer en un entorno local o de pruebas privado.

## Cuentas ficticias

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Cliente principal, Camila Torres | `cliente@demo.cl` | `Demo2026!` |
| Administrador | `admin@demo.cl` | `Demo2026!` |
| Cliente adicional, Matías González | `matias@demo.cl` | `Demo2026!` |
| Cliente adicional, Valentina Rojas | `valentina@demo.cl` | `Demo2026!` |
| Cliente adicional, Nicolás Soto | `nicolas@demo.cl` | `Demo2026!` |

Los botones **Soy cliente** y **Administrador** completan el formulario; presiona **Iniciar sesión** para entrar. Las contraseñas no se guardan en el navegador. La selección del perfil no concede permisos: el servidor obtiene el rol de la cuenta autenticada.

## Probar el recorrido

1. Inicia sesión como cliente. Selecciona un día disponible del calendario, presiona **Solicitar renovación** y confirma. Aparecerá una solicitud pendiente, sin montos financieros.
2. Abre una ventana de incógnito u otro navegador e inicia sesión como administrador. Así conservas ambas sesiones. Una nueva pestaña normal comparte la misma sesión.
3. Revisa la campana de notificaciones. Las novedades se consultan cada seis segundos mientras el panel está visible y no estás editando un campo ni usando un diálogo.
4. En **Solicitudes**, aprueba la solicitud de Camila. Verifica que el cupo restante del día disminuya una sola vez. El cliente verá **Aprobada** al actualizarse el panel o recargar la página.
5. Prueba rechazar otra solicitud: cambia el estado sin descontar cupo. Filtra por pendientes, aprobadas o rechazadas y busca por nombre o correo.
6. En **Calendario**, selecciona un día, establece su cupo y guarda. Puedes deshabilitarlo para que deje de estar disponible a los clientes.
7. Para comprobar el caso de cupo insuficiente, reduce el cupo del día de una solicitud pendiente hasta el monto ya aprobado de ese día. La aprobación debe mostrar un error y conservar la solicitud pendiente. Nunca se admite un cupo inferior a lo ya aprobado.

El calendario abarca 90 días desde que se inicia el servidor. Los días de semana se habilitan inicialmente; fines de semana y feriados se pueden configurar manualmente. **No se calculan automáticamente los feriados chilenos.** La fecha actual y los horarios de solicitudes usan `America/Santiago`.

Solo se permite una solicitud pendiente por cliente. No se permite otra renovación aprobada del mismo cliente para la misma fecha. Después de un rechazo, se puede volver a solicitar una fecha que siga disponible. Las solicitudes pendientes no reservan cupo; se vuelve a comprobar al aprobar. El monto se obtiene del préstamo ficticio que el servidor asigna a cada cliente, no de datos enviados por el navegador.

## Pruebas automáticas

```bash
npm test
npm run test:e2e
```

`npm test` ejecuta 15 pruebas de API con el runner de Node, sin depender de un servidor ya iniciado. Comprueban sesiones, separación de permisos, ausencia de datos financieros en respuestas de clientes, privacidad entre clientes, notificaciones, días bloqueados, validación de cupos, rechazos, aprobaciones duplicadas y concurrencia que podría sobrepasar cupos.

`npm run test:e2e` ejecuta cuatro pruebas con Playwright: recorrido cliente/administrador, gestión de disponibilidad y rechazos, navegación móvil a 390 px, y errores de acceso/diálogos. Arranca un servidor aislado en el puerto 3100, usa datos nuevos y lo detiene al terminar. Deja capturas en `test-results/` y trazas si ocurre un fallo.

La configuración usa `/usr/bin/chromium` cuando existe, como en este entorno. Si no tienes Chromium instalado, descarga el navegador de Playwright una vez:

```bash
npx playwright install chromium
```

También puedes indicar un Chromium existente con `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chromium npm run test:e2e`. En algunos sistemas Linux Playwright requiere bibliotecas del sistema; sigue las instrucciones oficiales de instalación de Playwright si el navegador no inicia.

## Estructura

```text
server.js                  Servidor HTTP, sesiones, datos ficticios y reglas de negocio
public/index.html          Documento de la aplicación
public/app.js              Paneles, calendario, formularios y navegación
public/styles.css          Diseño adaptable y estados visuales
test/api.test.js           Pruebas de API y concurrencia
test/browser/flows.spec.js Pruebas de navegador
playwright.config.js       Servidor aislado y configuración de pruebas
```

La aplicación usa HTML, CSS y JavaScript sin un framework ni dependencias de ejecución. Playwright es una dependencia de desarrollo. No utiliza fuentes, servicios analíticos ni contenido de terceros para funcionar.

## API y permisos

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `POST /api/login` | Público | Inicia una sesión de demostración |
| `GET /api/session` | Autenticado | Identidad y rol, sin datos financieros |
| `POST /api/logout` | Autenticado | Invalida la sesión |
| `GET /api/client/dashboard` | Cliente | Fechas disponibles y solicitudes propias; nunca montos ni cupos |
| `POST /api/client/requests` | Cliente | Crea una solicitud con `{ "date": "AAAA-MM-DD" }` |
| `GET /api/admin/dashboard` | Administrador | Cupos, solicitudes, montos y notificaciones |
| `PUT /api/admin/days/AAAA-MM-DD` | Administrador | Configura `{ "enabled": true, "capacity": 2500000 }` |
| `POST /api/admin/requests/:id/decision` | Administrador | Resuelve con `{ "status": "approved" }` o `rejected` |
| `POST /api/admin/notifications/read` | Administrador | Marca las notificaciones como leídas |

Las operaciones de escritura requieren JSON y el encabezado `X-Requested-With: Renueva`; se rechazan orígenes distintos y no se habilita CORS. Las sesiones usan un identificador aleatorio en una cookie `HttpOnly`, `SameSite=Strict`, con expiración de ocho horas; las contraseñas ficticias se verifican con scrypt. Hay límite de intentos fallidos por dirección de conexión. Los archivos del servidor y del repositorio no se sirven como contenido público. La interfaz añade una política CSP y escapa los datos al presentarlos.

## Límites de esta versión y siguiente etapa

**Es un prototipo, no un sistema listo para clientes reales.** Las credenciales de demostración son públicas. Los datos, sesiones y notificaciones viven en memoria: se reinician al detener el servidor. No se envían correos, SMS ni notificaciones externas.

Las aprobaciones son atómicas dentro de **un único proceso Node**: no hay esperas entre comprobar el estado/cupo y guardar la decisión. Antes de usar una base de datos o varias instancias se necesitan transacciones, bloqueo de registros y restricciones de unicidad que conserven esas garantías. Esta versión no proporciona persistencia ni auditoría durable.

La siguiente etapa debe sustituir las cuentas de demostración por una autenticación segura, persistir usuarios/préstamos/solicitudes/disponibilidad en una base de datos y añadir auditoría de decisiones. Para despliegue real también se requiere HTTPS y cookies `Secure` (`COOKIE_SECURE=true` sirve para activar esa bandera detrás de HTTPS), gestión de secretos y controles operativos. No ingreses información real en esta versión.
