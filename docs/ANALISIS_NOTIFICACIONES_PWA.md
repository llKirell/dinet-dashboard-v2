# Análisis de viabilidad: Notificaciones Push y PWA — DINET Dashboard

> **Tipo de documento:** Diagnóstico, viabilidad y planificación técnica.
> **Alcance:** Solo análisis. No se modifica código, base de datos, diseño ni configuración.
> **Fecha:** 2026-07-18
> **Fuentes:** Código fuente del repositorio `llKirell/dinet-dashboard-v2` (verificado archivo por archivo) e intento de inspección de la URL pública indicada.

---

## Advertencia previa importante

La URL indicada (`https://dms-stitch-pro.vercel.app/dashboard`) **no pudo inspeccionarse**: el servidor respondió **HTTP 403 Forbidden** desde este entorno (compatible con la "Deployment Protection" de Vercel o con una restricción de red del entorno de análisis).

Además, existe una **discrepancia que debe aclararse**: este repositorio solo contiene las páginas `index.html` y `cursos.html`; **no existe ninguna ruta `/dashboard`**. El nombre del despliegue (`dms-stitch-pro`) tampoco coincide con el del repositorio (`dinet-dashboard-v2`). Es posible que esa URL corresponda a **otro proyecto distinto** (por ejemplo, una interfaz generada con otra herramienta). Todo lo que sigue está basado en el **código real de este repositorio**, que es lo único comprobable. Si la aplicación objetivo es otra, el diagnóstico de la sección A debe repetirse sobre ese otro código.

---

# A. DIAGNÓSTICO DE LA APLICACIÓN

## A.1 Tipo de aplicación

**Comprobado:** Es una **página web tradicional estática** (multi-page: `index.html` + `cursos.html`). No es SPA con framework, no es PWA, no es híbrida.

## A.2 Tecnologías utilizadas

**Comprobado en el código:**

| Componente | Tecnología |
|---|---|
| Frontend | HTML5, CSS3 y JavaScript "vanilla" (sin React, Next.js, Vue ni Angular) |
| Lectura de datos | **SheetJS (xlsx 0.18.5)** cargado desde CDN; el Excel se procesa **en el navegador** |
| Persistencia local | `localStorage` (overrides de Stage/Estado de carga, URL de API opcional) y File System Access API para recordar el archivo Excel |
| Datos | Carpeta `data/` con `latest.xlsx`, `cursos.xlsx`, catálogo de clientes en JS |
| Automatización | Commits automáticos "Auto update dashboard data" cada ~15 minutos (un proceso externo actualiza `data/latest.xlsx` y hace push; el mecanismo exacto no está en el repo) |
| API opcional | `script.js` puede leer filas desde un endpoint `/api/dashboard-rows` **solo si** se configura explícitamente vía `?api=` o `<meta name="dinet-api-url">`. Por defecto está deshabilitado. |

## A.3 Checklist de diagnóstico

| Elemento | Estado | Cómo se comprobó |
|---|---|---|
| Service Worker | ❌ **No existe** | Búsqueda en todo el repo: cero referencias a `serviceWorker` / archivos `sw.js` |
| `manifest.json` / `.webmanifest` | ❌ **No existe** | No hay archivo ni `<link rel="manifest">` en el HTML |
| Instalable como app (PWA) | ❌ **No** | Sin manifest ni SW no cumple criterios de instalabilidad |
| HTTPS | ✅ **Sí (probable-alto)** | Todo dominio `*.vercel.app` sirve HTTPS obligatorio; no verificado en vivo por el 403 |
| Sistema de notificaciones actual | ❌ **No existe ninguno** | Ni Notifications API, ni push, ni toasts internos; solo `window.alert()` para errores de carga de Excel |
| Backend | ❌ **No hay** (solo el endpoint opcional descrito arriba, externo al repo) | Código fuente |
| Base de datos | ❌ **No hay** | Los datos viven en archivos Excel dentro del repo |
| Autenticación / usuarios | ❌ **No hay** | No hay login, sesiones, ni concepto de usuario o rol |
| Hosting | GitHub (código) + presumiblemente **Vercel** (despliegue estático) | La URL es de Vercel; **no verificable** que ese despliegue sea este repo |

## A.4 Clasificación de la información

- **Comprobado:** todo lo relativo al código del repositorio (A.1–A.3, columnas "Comprobado").
- **Probable:** que el sitio se sirva por HTTPS en Vercel; que la actualización automática del Excel provenga de un script/robot externo.
- **No verificable sin más acceso:** el contenido real de `dms-stitch-pro.vercel.app` (403), la configuración del proyecto en Vercel, el mecanismo que hace los commits automáticos, y si existe algún backend externo que exponga `/api/dashboard-rows`.

**Conclusión del diagnóstico:** el proyecto está en un punto de partida "cero" para notificaciones: no hay usuarios, no hay backend, no hay base de datos y no hay PWA. Nada de esto es un bloqueo — pero implica que los requisitos 9 y 10 (segmentación por usuario/rol y trazabilidad) exigen **construir** una capa de backend + autenticación que hoy no existe.

---

# B. VIABILIDAD TÉCNICA

| Función | ¿Es posible? | Dispositivos compatibles | Requisitos | Limitaciones | Dificultad |
|---|---|---|---|---|---|
| Notificaciones internas (in-app) | ✅ Sí, siempre | Todos (cualquier navegador) | Solo frontend: sistema de toasts/campana + fuente de eventos | Solo visibles con la app abierta | Baja |
| Notificaciones del navegador (app abierta) | ✅ Sí | Android/Windows/macOS con Chrome, Edge, Firefox; Safari con permiso | HTTPS + permiso del usuario (Notifications API) | En iOS solo funciona como PWA instalada; bloqueables por el usuario | Baja-Media |
| Push en segundo plano (app cerrada) | ✅ Sí | Android, Windows, macOS; iPhone con condiciones | Service Worker + Push API + servidor con claves VAPID + BD de suscripciones | Entrega "best effort"; ahorro de batería puede retrasarla; requisitos iOS abajo | Media-Alta |
| Notificaciones en Android | ✅ Sí (el caso mejor soportado) | Chrome, Edge, Firefox, Samsung Internet | Lo anterior + permiso | Modos de ahorro de batería agresivos (Xiaomi, Huawei…) pueden retrasar | Media |
| Notificaciones en iPhone | ⚠️ Sí, con condiciones estrictas | iOS/iPadOS 16.4+ | La web debe ser **PWA instalada en pantalla de inicio**; permiso solicitado tras gesto del usuario | No funciona desde Safari "normal"; sin vibración; sonido/estilo controlado por iOS; el usuario debe instalar la app manualmente | Media-Alta |
| Notificaciones en Windows | ✅ Sí | Chrome, Edge, Firefox | Push estándar; permiso | Con el navegador totalmente cerrado (sin proceso en 2.º plano) no se entregan hasta reabrirlo; el modo "Concentración/No molestar" de Windows las silencia | Media |
| Notificaciones en macOS | ✅ Sí | Chrome, Edge, Firefox, **Safari 16+** | Push estándar; en Safari el sistema las entrega vía Centro de Notificaciones | Chrome cerrado = no entrega; Safari/macOS las entrega aunque Safari esté cerrado; modo No molestar las silencia | Media |
| Vibración del dispositivo | ⚠️ Parcial | **Solo Android** (Chrome y derivados) | Opción `vibrate` en la notificación o `navigator.vibrate()` en app abierta | **iOS no soporta la Vibration API en web** (ni en PWA); en escritorio no aplica; el modo silencio del teléfono la puede anular | Baja (donde existe) |
| Sonidos personalizados | ⚠️ Muy limitado | App abierta: todos (con interacción previa). Push: prácticamente ninguno | En app abierta: `<audio>`/Web Audio. En push: el SO usa **su sonido por defecto** | La propiedad `sound` de Notifications API no está implementada en la práctica; no se puede garantizar un sonido propio en push web | Baja (in-app) / No viable (push) |
| Botones de acción en la notificación | ⚠️ Parcial | Android + Chromium de escritorio (Chrome/Edge) | `actions` en el SW (`showNotification`) | **Safari (iOS y macOS) no soporta botones de acción**; Firefox soporte limitado | Media |
| Notificaciones a usuarios específicos | ✅ Sí | Todos los que reciban push | **Autenticación** + tabla suscripción↔usuario + envío selectivo desde backend | Hoy no existe ni login ni backend: hay que construirlos | Media-Alta |
| Por rol, cuenta, sede, bloque o proceso | ✅ Sí | Ídem | Lo anterior + modelo de roles/sedes + motor de reglas de enrutamiento | Igual: requiere backend y modelo de datos nuevos | Alta |
| Historial y trazabilidad de alertas | ✅ Sí | N/A (backend) | Base de datos con tabla de notificaciones + estados | "Entregada" en el dispositivo no siempre es confirmable al 100 % (el SO no lo garantiza) | Media |
| Confirmación de lectura/atención | ⚠️ Parcial | Todos | Evento `notificationclick` en el SW + botón "Atender" in-app que reporte al backend | Se puede registrar **clic** y **atención**; "leída sin clic" (solo vista en la bandeja) **no es detectable** en web push | Media |

---

# C. LIMITACIONES REALES

**Ninguna función que dependa del navegador o del sistema operativo debe prometerse como garantizada.** Detalle:

1. **Dependen del navegador:** soporte de Push API/SW (todos los navegadores modernos lo tienen; iOS solo dentro de PWA instalada), botones de acción (solo Chromium), vibración (solo Chrome/Android), comportamiento con el navegador cerrado.
2. **Dependen del sistema operativo:** sonido de la notificación (siempre lo decide el SO en push), modos No molestar/Concentración, ahorro de batería (Android agresivo en algunas marcas puede retrasar o agrupar), y en iOS la propia posibilidad de recibir push web.
3. **Requieren autorización explícita del usuario:** todas las notificaciones del sistema (permiso `Notification.requestPermission()`, que además debe pedirse tras un gesto del usuario en Safari/iOS). La vibración in-app también requiere interacción previa. Las alertas internas (in-app) son las únicas que **no** requieren permiso.
4. **Si el usuario bloquea las notificaciones:** no se pueden mostrar ni volver a pedir permiso desde código; solo el usuario puede revertirlo en ajustes del navegador/SO. La app debe detectar el estado `denied` y hacer fallback a alertas internas + (opcional) otro canal (correo, WhatsApp Business API, etc.).
5. **Con el navegador cerrado:** Android → sí llegan (Play Services mantiene el canal). macOS Safari → sí llegan (las gestiona el sistema). Windows/macOS con Chrome/Edge/Firefox completamente cerrados → **no llegan hasta reabrir el navegador** (Chrome puede quedar en segundo plano y entonces sí). iPhone → llegan si la PWA está instalada, aunque no esté abierta.
6. **Con el celular bloqueado:** las notificaciones llegan y se muestran en pantalla de bloqueo (según configuración del usuario). En Android extremo ahorro de energía puede diferirlas.
7. **Android vs iPhone:**
   - Android: push desde el navegador sin instalar nada, vibración soportada, botones de acción, imágenes.
   - iPhone: **obligatorio instalar la PWA** (Compartir → "Añadir a pantalla de inicio"), sin vibración, sin botones de acción, sin sonido personalizado, permiso solo tras gesto del usuario. Si el usuario borra la PWA, la suscripción muere.
8. **Web normal vs PWA vs app nativa:** una web normal solo puede notificar en Android/escritorio; una **PWA** añade instalación, icono, pantalla completa y habilita iOS; una **app nativa/híbrida** añade garantías plenas de sonido personalizado, vibración en iOS, canales de notificación y prioridad — a costa de tiendas de aplicaciones, coste y mantenimiento.
9. **Vibración/sonido no garantizables cuando:** el dispositivo está en silencio/No molestar, es iOS (vibración web inexistente), es push (sonido siempre del SO), o el usuario configuró la app/canal como silencioso.
10. **Navegadores/dispositivos potencialmente incompatibles:** iOS < 16.4, navegadores dentro de apps (WebView de WhatsApp/Instagram), Safari sin PWA instalada en iOS, navegadores muy antiguos (IE, Chrome < 50), y algunos Android de gama baja con Play Services alterados.

---

# D. ARQUITECTURA RECOMENDADA (sin implementar todavía)

Dado el estado actual (estático en Vercel, sin backend), la arquitectura de menor fricción es:

```
┌──────────────────────────── FRONTEND (actual + PWA) ────────────────────────────┐
│  index.html + script.js  →  + manifest.webmanifest  + sw.js (Service Worker)    │
│  + módulo de alertas internas (campana/toasts) + panel de preferencias          │
└──────────────┬──────────────────────────────────────────────────────────────────┘
               │ suscripción push (PushManager.subscribe con clave VAPID pública)
               ▼
┌──────────────────────────── BACKEND (nuevo) ────────────────────────────────────┐
│  Opción ligera: Vercel Serverless Functions (Node.js) + librería `web-push`     │
│  Opción integral: Supabase (Auth + Postgres + Edge Functions + Realtime)        │
│  Módulos: API suscripciones · Motor de reglas · Cola de envío · Auditoría       │
└──────────────┬──────────────────────────────────────────────────────────────────┘
               ▼
┌──────────────────────────── BASE DE DATOS (nueva, p. ej. Postgres) ─────────────┐
│  users(id, rol, sede, bloque)                                                   │
│  push_subscriptions(id, user_id, endpoint, claves p256dh/auth, device, estado)  │
│  alert_rules(id, evento, condición, destinatarios, prioridad, canal)            │
│  notifications(id, rule_id, user_id, nivel, mensaje, estado, timestamps)        │
│  notification_events(notification_id, evento: enviada/recibida/click/atendida)  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Service Worker:** recibe `push`, muestra `showNotification` (título, cuerpo, icono, `vibrate` en Android, `tag`, `actions` donde se soporte), maneja `notificationclick` para abrir la app y reportar el clic.
- **Push API + VAPID:** claves generadas una vez; la **privada solo en el backend** (variable de entorno), la pública en el frontend.
- **Suscripción de dispositivos:** al conceder permiso, el navegador devuelve un endpoint único → se guarda vinculado al usuario autenticado. Un usuario puede tener N dispositivos.
- **Motor de reglas:** tabla configurable evento→condición→destinatarios→nivel (informativa/advertencia/urgente/crítica). Los eventos pueden originarse del propio proceso que hoy actualiza `latest.xlsx` (comparando el Excel nuevo contra el anterior) o de acciones en la UI.
- **Cola de notificaciones:** necesaria para reintentos y limpieza de suscripciones muertas (respuestas 404/410 del push service). En fase inicial basta una tabla `pending` procesada por una función programada; a escala, una cola real (QStash, Supabase cron, etc.).
- **Historial/auditoría:** cada envío y cada transición de estado se registra en `notifications`/`notification_events`.
- **Permisos por usuario y rol + panel de configuración:** página de ajustes donde cada usuario activa/desactiva tipos de alerta, horarios y dispositivos; los administradores gestionan reglas.

**Flujo completo:**

1. Se produce un evento (ej.: el Excel actualizado muestra que una unidad superó el tiempo de espera, o un operador marca "rampa disponible").
2. El backend evalúa las reglas activas para ese evento.
3. Resuelve los destinatarios (usuario, rol, sede, bloque o proceso) y sus preferencias.
4. Crea registros en `notifications` (estado: *pendiente*) y los encola.
5. El worker de envío firma con VAPID y hace POST al push service de cada suscripción (FCM/APNs/Mozilla, transparente para nosotros) → estado *enviada*.
6. El SO/navegador del dispositivo muestra el aviso (banner, pantalla de bloqueo, vibración si Android) → el SW puede reportar *recibida*.
7. El usuario toca la notificación (→ *leída*) y, dentro de la app, pulsa "Atender" (→ *atendida*); si no, un cron la marca *vencida* y puede escalarla.
8. Todo queda en `notification_events` para auditoría y métricas.

---

# E. ALTERNATIVAS DE IMPLEMENTACIÓN

| Opción | Ventajas | Desventajas | Costo aprox. | Dificultad | Dependencia | Compatibilidad | Seguridad | Mantenimiento |
|---|---|---|---|---|---|---|---|---|
| **Web Push estándar (SW + VAPID, desarrollo propio)** | Sin proveedor, sin costo por mensaje, control total, estándar W3C | Hay que construir suscripciones, cola, reintentos y métricas | $0 en licencias; solo hosting (Vercel/Supabase tienen capa gratuita) | Media | Ninguna (solo push services de cada navegador) | Android/Win/macOS + iOS 16.4 PWA | Alta (claves propias, cifrado extremo a extremo del payload) | Medio |
| **Firebase Cloud Messaging (FCM)** | SDK maduro, tópicos/grupos, consola de pruebas, gratuito | Acopla a Google; en web sigue exigiendo SW y las mismas limitaciones iOS; añade dependencia sin quitar trabajo de backend propio para trazabilidad | $0 (FCM es gratuito) | Media | Alta (Google) | Igual que Web Push | Buena | Medio |
| **OneSignal** | Muy rápido de montar, dashboard, segmentación y estadísticas incluidas | Datos de usuarios en un tercero, marca en plan gratuito, costo al crecer, menos control de la trazabilidad fina (estado *atendida* igual requiere desarrollo propio) | Gratis hasta ~10k suscriptores web; luego desde ~$9–99+/mes | Baja | Muy alta | Igual que Web Push | Media (terceros ven metadatos) | Bajo |
| **PWA (convertir la app actual)** | Prerrequisito de iOS; instalable en celular y PC; sin tiendas; reutiliza el 100 % del código actual | No resuelve por sí sola el envío (necesita alguna de las opciones anteriores) | $0 | Baja-Media | Ninguna | Todos los SO modernos | N/A | Bajo |
| **Híbrida con Capacitor** | Push nativo real en iOS (APNs) con sonido/vibración garantizados; acceso a APIs nativas | Publicación en App Store/Play Store ($99/año Apple + $25 Google), builds nativos, dos pipelines más | Cuentas de tienda + tiempo de desarrollo (semanas) | Alta | Media (Apple/Google) | Android/iOS totales | Alta | Alto |
| **App nativa (Kotlin/Swift)** | Máximo control y fiabilidad | Reescritura completa ×2 plataformas; el equipo actual trabaja en web | Alto (meses de desarrollo) | Muy alta | Media | Android/iOS | Alta | Muy alto |

**Recomendación según el estado actual:** **PWA + Web Push propio con VAPID** (librería `web-push` en funciones serverless) y **Supabase** como backend/BD/auth si se quiere acelerar la parte de usuarios y roles. FCM es una alternativa razonable si ya se planea ecosistema Google; OneSignal solo si se prioriza velocidad sobre control de datos. Capacitor queda como plan B futuro si iOS exige vibración/sonido garantizados.

---

# F. REQUISITOS NECESARIOS

**Obligatorios:**
- Acceso al código fuente ✅ (ya disponible: este repo).
- Confirmar **qué despliegue corresponde a la URL indicada** y acceso al proyecto de Vercel (o el hosting real).
- Dominio con HTTPS ✅ (Vercel lo da; verificar en producción).
- Crear Service Worker y manifest de PWA (hoy inexistentes).
- Construir **sistema de autenticación** e identificación única de usuarios (hoy inexistente) — sin esto, los requisitos de segmentación y trazabilidad no son realizables.
- Base de datos con tabla de suscripciones/dispositivos y de notificaciones (hoy inexistente).
- Servicio backend para firmar y enviar push (funciones serverless o similar).
- Generación y custodia de claves VAPID (privada solo en variables de entorno del servidor).
- Permiso de notificaciones concedido por cada usuario en cada dispositivo.
- Pruebas reales en Android, iPhone (iOS ≥ 16.4, PWA instalada) y PC (Windows y macOS).

**Recomendables:**
- Definir el origen formal de eventos (idealmente instrumentar el proceso que hoy actualiza `latest.xlsx`).
- Política de privacidad y tratamiento de datos (se pasará a almacenar usuarios y dispositivos).
- Cola con reintentos y limpieza de suscripciones caducadas.
- Panel de administración de reglas y preferencias por usuario.
- Entorno de staging separado de producción.

**Opcionales:**
- Canal de respaldo (correo/WhatsApp) para alertas críticas no entregadas.
- Dominio propio (en vez de `*.vercel.app`) — mejora identidad, no es requisito técnico.
- Monitorización de tasas de entrega/lectura.

---

# G. MODELO FUNCIONAL DE ALERTAS (ejemplo)

Campos del modelo: nombre, evento generador, destinatarios, prioridad, mensaje, canal, vibración*, sonido*, repetición, tiempo de atención (SLA), estados (*pendiente → enviada → recibida → leída → atendida | vencida*).

\* Vibración solo efectiva en Android; sonido siempre el del SO en push (personalizado solo in-app).

| Alerta | Evento | Destinatarios | Nivel | Canal | Vibración | Repetición | SLA |
|---|---|---|---|---|---|---|---|
| Unidad arribó a playa | Registro de arribo (placa detectada en base) | Supervisor de patio + Operador asignado | Informativa | In-app + push | No | No | 15 min |
| Unidad superó tiempo máximo de espera | Cron: espera > umbral configurado | Supervisor de sede | **Urgente** | Push + in-app | Sí (Android) | Cada 15 min hasta atender | 10 min |
| Rampa disponible | Cambio de Stage a libre | Operadores del bloque | Informativa | In-app + push | No | No | 10 min |
| Carga iniciada | Stage pasa a EN_CARGA | Supervisor + Cliente (si aplica) | Informativa | In-app | No | No | — |
| Carga retrasada | Avance < esperado a la hora H | Supervisor + Jefe de operaciones | **Advertencia** | Push + in-app | Sí | 1 recordatorio a los 20 min | 20 min |
| Unidad lista para salir | Fin de carga = OK | Transportista/Despacho | Informativa | Push | No | No | 15 min |
| Documento pendiente | Checklist documental incompleto al cierre | Administrativo de sede | Advertencia | Push + in-app | No | Diaria hasta resolver | 4 h |
| Incidencia de seguridad | Reporte manual de incidencia | Supervisor + Seguridad + Admin | **Crítica** | Push + in-app (+ canal respaldo) | Sí | Cada 5 min hasta atender | 5 min |
| Alerta crítica no atendida | Crítica vence su SLA | Escalado: Jefe de operaciones / Admin | **Crítica** | Push + respaldo | Sí | Cada 5 min | 5 min |

---

# H. SEGURIDAD

- **Protección de suscripciones push:** los endpoints de suscripción son sensibles (quien los tenga + claves puede enviar avisos). Guardarlos cifrados o con acceso restringido por RLS/backend; nunca exponerlos al frontend de otros usuarios.
- **Autorización por usuario y rol:** toda API de envío debe validar sesión y rol en el servidor; el frontend nunca decide a quién se envía.
- **Información sensible en la notificación:** el texto del push aparece en pantalla de bloqueo. Regla: enviar solo referencia genérica ("Tienes una alerta crítica de despacho") y el detalle dentro de la app tras autenticarse. Nunca datos de clientes, placas completas ni cifras confidenciales en el cuerpo del push si la política de datos lo restringe.
- **Revocación de dispositivos:** panel para listar y eliminar dispositivos por usuario; eliminar suscripciones que devuelvan 404/410.
- **Usuarios que cerraron sesión:** al hacer logout, desuscribir (`subscription.unsubscribe()`) y marcar la suscripción inactiva en BD; de lo contrario, el dispositivo seguiría recibiendo alertas de una cuenta a la que ya no está conectado.
- **Protección de claves:** clave VAPID privada y credenciales de BD solo en variables de entorno del servidor; rotación si hay sospecha de fuga; jamás en el repositorio (hoy el repo es público-estático: cuidado especial con esto).
- **Rate limiting y anti-spam:** límite de envíos por usuario/hora, deduplicación por `tag`, agrupación de eventos repetidos y ventanas de silencio configurables; evita fatiga de alertas y bloqueos del push service.
- **Auditoría:** registro inmutable de quién configuró cada regla y de cada envío con timestamp, destinatario y resultado.
- **Privacidad:** al empezar a tratar datos personales (usuarios, dispositivos), publicar política de privacidad y cumplir la normativa aplicable (en Perú, Ley 29733 de Protección de Datos Personales).

---

# I. PLAN DE IMPLEMENTACIÓN

| Fase | Objetivo | Actividades clave | Entregables | Riesgos | Dependencias | Criterio de cierre |
|---|---|---|---|---|---|---|
| **1. Diagnóstico técnico** | Confirmar la app real y su hosting | Aclarar qué es `dms-stitch-pro.vercel.app`; acceso a Vercel; validar este análisis | Informe validado (este documento) | Que la URL sea otro proyecto | Accesos del propietario | Diagnóstico confirmado por el equipo |
| **2. Eventos y reglas** | Definir qué dispara alertas | Catálogo de eventos (arribos, esperas, rampas…), niveles, destinatarios, SLA | Matriz evento→regla→destinatario firmada por operaciones | Reglas ambiguas → spam | Fase 1 | Matriz aprobada |
| **3. Notificaciones internas** | Valor inmediato sin permisos | Campana + toasts + centro de alertas en el dashboard, alimentado por los datos ya cargados | Módulo in-app funcionando | Ninguno relevante | Fase 2 | Alertas visibles al detectar eventos en el Excel |
| **4. Conversión a PWA** | Instalable en celular y PC; base para push | `manifest.webmanifest`, iconos, `sw.js` básico con caché, prueba de instalación | App instalable Android/iOS/desktop | Caché mal configurada sirviendo datos viejos | Fase 1 | Instala y pasa Lighthouse PWA |
| **5. Push básico** | Notificar con la app cerrada | Claves VAPID, endpoint de suscripción, tabla `push_subscriptions`, función de envío, `push`/`notificationclick` en SW | Push de prueba recibido en Android y PC | Limitaciones iOS; suscripciones muertas | Fases 3–4 + backend mínimo | Push llega con la pestaña cerrada |
| **6. Usuarios y segmentación** | Dirigir por usuario/rol/sede | Autenticación (p. ej. Supabase Auth), modelo users/roles/sedes, vínculo suscripción↔usuario, motor de reglas | Envíos dirigidos operativos | Alcance del modelo de roles crece | Fase 5 | Alerta llega solo a su destinatario |
| **7. Historial y trazabilidad** | Auditoría completa | Tablas `notifications`/`notification_events`, estados, pantalla de historial, botón "Atender" | Historial consultable con estados | "Recibida" no 100 % fiable (documentarlo) | Fase 6 | Ciclo pendiente→atendida registrado |
| **8. Pruebas multiplataforma** | Validar dispositivos reales | Matriz Android (2–3 marcas), iPhone ≥ 16.4, Windows, macOS; permisos, bloqueo, No molestar, batería | Informe de compatibilidad | Fragmentación Android; iOS estricto | Fases 4–7 | Matriz ejecutada y documentada |
| **9. Piloto controlado** | Uso real acotado | 1 sede / 5–10 usuarios, 2–3 alertas, ajuste de umbrales y fatiga | Informe de piloto con métricas de entrega/atención | Fatiga de alertas | Fase 8 | Métricas aceptadas por operaciones |
| **10. Despliegue y monitoreo** | Producción total | Rollout por sedes, capacitación (instalación PWA en iPhone), dashboards de entrega, limpieza automática de suscripciones | Sistema en producción + runbook | Degradación silenciosa de entregas | Fase 9 | Operación estable ≥ 2 semanas |

---

# J. CONCLUSIÓN

1. **¿Es posible implementar las mejoras?** Sí. Las 10 mejoras son técnicamente viables sobre esta base, aunque 3 de ellas (vibración, sonido, y "notificaciones garantizadas" en todo escenario) solo de forma **parcial** por límites de navegadores y sistemas operativos.
2. **¿Qué puede garantizarse?** Alertas internas in-app (todas las plataformas), niveles de alerta, segmentación por usuario/rol/sede (una vez exista autenticación), historial y trazabilidad de envíos y atenciones, y push en Android con navegador estándar.
3. **¿Qué tiene limitaciones?** iPhone (solo iOS ≥ 16.4 y solo con la PWA instalada; sin vibración, sin botones, sonido del sistema), sonido personalizado en push (no viable en web), vibración (solo Android), entrega con Chrome/Edge/Firefox totalmente cerrados en PC (no llega hasta reabrir), confirmación de "leída sin clic" (no detectable), y cualquier caso con permiso denegado o modo No molestar.
4. **¿Debe convertirse en PWA?** **Sí.** Es requisito indispensable para iPhone y muy recomendable para instalación en Android y PC. Hoy no lo es.
5. **¿Se necesita modificar el backend?** Hay que **crearlo**: hoy no existe backend (la app es 100 % estática). Mínimo: funciones serverless para suscripciones y envío, más autenticación.
6. **¿Se necesita modificar la base de datos?** Hay que **crearla**: hoy los datos viven en archivos Excel del repositorio. Se necesitan tablas de usuarios, suscripciones, reglas y notificaciones.
7. **¿Alternativa más recomendable?** **PWA + Web Push estándar con claves VAPID propias**, con backend ligero (Vercel Functions o, preferentemente, **Supabase** para resolver a la vez auth + Postgres + funciones). FCM/OneSignal solo si se prioriza velocidad sobre control.
8. **¿Qué información o accesos faltan?** (a) Confirmar qué aplicación sirve realmente `dms-stitch-pro.vercel.app` — respondió 403 y su ruta `/dashboard` no existe en este repo; (b) acceso al proyecto de Vercel; (c) identificar el proceso que hace los commits automáticos de `latest.xlsx` (candidato ideal a generador de eventos); (d) definición de usuarios, roles y sedes reales; (e) decisión sobre proveedor de backend/BD.
9. **¿Primer paso?** Cerrar la **Fase 1**: aclarar la discrepancia URL↔repositorio y aprobar la matriz de eventos y reglas (Fase 2). En paralelo, la **Fase 3 (alertas internas)** puede iniciarse de inmediato porque no requiere permisos, backend ni PWA, y entrega valor visible en días.

---

*Elementos señalados expresamente como no verificables sin más acceso: contenido y configuración del despliegue en Vercel (403), mecanismo de los commits automáticos, existencia de cualquier backend externo opcional (`/api/dashboard-rows`) y comportamiento en producción (HTTPS, cabeceras). Todo lo demás fue comprobado directamente en el código fuente del repositorio.*
