# Reparto de tareas: Claude y Codex

Acordado el 2026-11-02 para lograr el máximo rendimiento y gastar menos tokens.

## Quién hace qué

**Claude (sesión principal)**
- Habla con el usuario y toma las decisiones.
- Edita el código, compila el APK y el `.exe`, instala y prueba en el Pixel (adb y depuración del WebView) y en el navegador.
- Hace la verificación final y dice qué comprobó de verdad y qué quedó pendiente.
- Ante un fallo, primero lo reproduce y recoge el error.

**Codex (segunda opinión, solo lectura por defecto)**
- Revisa los cambios antes de cada versión, sobre todo en cifrado, importación, almacenamiento y el puente con Android. Su revisión aporta evidencia, pero no certifica la seguridad.
- Investiga en la web y critica el diseño solo cuando hay una pregunta concreta.
- Diagnostica un fallo solo si la causa sigue sin estar clara después de que Claude lo reprodujo. Devuelve la causa probable, la evidencia y la siguiente comprobación.
- Hace trabajo mecánico (por ejemplo, nuevos idiomas en `web/i18n.js` o pruebas en `sesame.test.js`) solo si se le asigna explícitamente, con los archivos y el criterio de aceptación definidos.

## Reglas para ahorrar tokens

- **Encargos:** cada uno incluye objetivo, versión base, archivos, evidencia disponible y resultado esperado. Se pasan rutas, no contenido pegado; las líneas pueden cambiar.
- **Respuestas de Codex:** 300 palabras como máximo, salvo hallazgos que lo justifiquen. Una ronda por defecto; la segunda solo si hay un desacuerdo concreto.
- **Contexto:** se reutiliza el mismo hilo de Codex, pero se releen los archivos que cambiaron.
- **Sin duplicar:** cada frente lo investiga o lo escribe una sola persona; nunca hay dos escritores sobre el mismo archivo.
- **Sin repetir:** no se pide otra revisión si no hay cambios nuevos, dudas pendientes o un riesgo concreto, ni se rehacen comprobaciones que ya fueron concluyentes.
- **Lo pequeño, directo:** los cambios triviales no pasan por Codex.
