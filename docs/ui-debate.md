# OpenSesame — debate de interfaz (Claude ↔ Codex)

## Contexto

OpenSesame cifra archivos con contraseña (AES-256-GCM, PBKDF2) y los guarda en una bóveda local. Cada archivo tiene su propia contraseña; se puede exportar como `.sesame` y abrir en otro dispositivo. Una sola interfaz web (`web/index.html`, `web/app.js`) corre en:

- **Android:** WebView dentro de un APK (`android/`), con un puente `window.OpenSesameAndroid.save()` y selector de archivos del sistema.
- **Windows:** Electron, `.exe` portátil (`main.cjs`).

Estado actual: tema oscuro, acento dorado `#e2b04a`, lista agrupada con separadores, insignia con la extensión (PDF/JPG), botón flotante "+ Agregar", hojas inferiores en móvil, rebote de presión (escala 0.92 → ~1.05 → 1) en todos los botones. El usuario pidió rebotes "satisfactorios" y que no parezca vibe-coded.

## Propuesta de Claude (ronda 1)

### Principio
Una herramienta de seguridad silenciosa y precisa, como 1Password o Proton Pass, no una landing page. Lo que da confianza es el detalle: tipografía ajustada, estados claros, cero adornos. La personalidad viene de las animaciones y de una sola metáfora: la cerradura.

### Una base, dos acentos de plataforma
`<html data-platform="android|desktop">` según exista el puente de Android.

| | Android (Material 3) | Windows (Fluent) |
|---|---|---|
| Fuente | Roboto / Google Sans del sistema | Segoe UI Variable |
| Agregar | FAB extendido abajo a la derecha | Botón "Agregar" en la barra superior + arrastrar y soltar archivos en la ventana |
| Opciones | Mantener pulsado → hoja inferior | Clic derecho → menú contextual en la posición del cursor |
| Diálogos | Hoja inferior | Centrado, 400 px |
| Lista | Una columna, filas de 64 px | Tabla: Nombre · Tipo · Tamaño · Fecha, filas de 44 px, ordenable por columna |
| Teclado | — | Ctrl+O agregar, Enter abrir, F2 renombrar, Supr eliminar, Ctrl+F buscar |
| Radios | 12 px lista, 16 px FAB y hojas | 6 px controles, 8 px diálogos |

### Color
- Superficies neutras ligeramente cálidas (`#0e0f12`, `#17191e`, `#20232a`).
- Un solo acento dorado para la acción principal y el foco; nunca de fondo decorativo.
- Rojo `#ef6b5e` solo para acciones destructivas.
- Opcional: tema claro que siga al sistema.

### Animaciones (todas con `prefers-reduced-motion`)
1. **Presión con rebote** (actual): Android hunde a 0.92 y rebota a 1.05; Windows más sutil, 0.97 → 1.015.
2. **Desbloqueo:** al descifrar, en vez de un spinner, el candado tiembla mientras deriva la clave y, al acertar, el arco se abre con un resorte. Si falla, sacude horizontalmente.
3. **Eliminar:** la fila se desliza a la izquierda y la lista se cierra con un resorte.
4. **Agregar:** la fila nueva entra desde arriba con un resaltado dorado breve.
5. **Hojas y diálogos:** suben con resorte; al cerrar bajan rápido (150 ms, sin rebote).

### Funciones nuevas propuestas
- **Buscar** (aparece con más de 6 archivos).
- **Ordenar:** recientes / nombre / tamaño.
- **Arrastrar y soltar** en Windows.
- **Pantalla "Seguridad"**: cómo se cifra, que no hay recuperación de contraseña y la versión.
- **Medidor de fuerza** de la contraseña al cifrar.
- No propongo un bloqueo global de la app (PIN/huella): es mucho alcance para esta versión.

## Respuesta de Codex (ronda 1)

Coincide con la dirección (herramienta precisa, personalidad en la interacción, dorado y cerradura), pero rechaza:

- **Dos sistemas visuales (Material + Fluent):** se adaptan comportamientos, no la identidad.
- **Tabla de 4 columnas en Windows:** la ventana mide 460 px y el nombre es el dato principal; mejor una lista compacta.
- **Búsqueda que aparece a partir de 7 archivos:** un control aprendido no debe aparecer y desaparecer.
- **Candado temblando mientras trabaja:** el temblor comunica error; mejor un indicador indeterminado y abrir el arco al terminar.
- **Eliminar deslizando a la izquierda:** sugiere un gesto que no existe, y un borrado irreversible no se celebra.
- **Medidor de contraseña y tema claro:** posponerlos.

Además pidió:

- Mantener siempre el botón ⋮.
- Rebote menos exagerado.
- Más contraste en el texto terciario.
- Textos precisos ("Descifrar y guardar copia", renombrar solo cambia la etiqueta).
- No anunciar "guardado" antes de que la plataforma lo confirme.
- Que Atrás en Android cierre primero la hoja.

## Respuesta de Claude (ronda 2)

Aceptó todo lo anterior. Defendió:

- Rebotes visibles en el teléfono, porque el usuario pidió explícitamente rebotes satisfactorios.
- Subir el mínimo de la contraseña de 6 a 8 caracteres, porque un `.sesame` robado admite un ataque offline.

Propuso además descifrar dentro del mismo diálogo de contraseña, y ordenar por Recientes, Nombre o Tamaño.

## Acuerdo final (ronda 2 de Codex)

**Identidad**
- Una sola identidad: fondos `#0e0f12`, `#17191e` y `#20232a`, texto `#ecebe8`, terciario con más contraste, dorado `#e2b04a` y rojo `#ef6b5e`.
- Fuente del sistema: 16 px en Android y 15 px en Windows. Títulos de 20 px.
- Radios: 8 px en controles, 12 px en la lista y 16 px en diálogos y FAB. Sin botones en forma de cápsula.

**Adaptación por plataforma y anchura**
- **Android:** FAB "Agregar", hojas inferiores en pantallas estrechas, filas de 64 px y objetivos de 48 px. Atrás cierra primero la hoja.
- **Windows:**
  - Botón "Agregar" en la barra superior y arrastrar y soltar con contorno visible.
  - Menú contextual en el cursor, con las mismas acciones.
  - Filas de unos 50 px, ventana de 720×760 y ancho útil máximo de 880 px.
  - Atajos: Ctrl+O, Ctrl+F, Enter y Escape. F2 y Supr solo con una fila enfocada y nunca mientras se escribe.

**Funciones**
- La búsqueda está siempre visible desde el primer archivo.
- Orden por Recientes, Nombre o Tamaño, recordado en el dispositivo.
- Botón ⋮ siempre visible.
- Mostrar u ocultar la contraseña.
- Diálogo de ayuda "Cómo funciona".
- Mínimo de 8 caracteres para cifrados nuevos, recomendando 4 palabras al azar.

**Descifrado contextual**
- Ocurre en el mismo diálogo: barra indeterminada mientras trabaja.
- Si falla, el icono sacude y el error queda bajo el campo.
- Si acierta, el arco se abre, el diálogo se cierra a los ~450 ms y se guarda la copia.
- "Guardado" solo se anuncia cuando la plataforma lo confirma; la cancelación se avisa aparte.

**Rebotes** (los keyframes dan el sobreimpulso, con easing `cubic-bezier(.2,.8,.2,1)`)

| Elemento | Plataforma | Escalas | Duración |
|---|---|---|---|
| Agregar | Android | 0,94 → 1,035 → 0,992 → 1 | 320 ms |
| Secundarios | Android | 0,96 → 1,02 → 0,996 → 1 | 260 ms |
| Filas | Android | 0,985 → 1,006 → 1 | 220 ms |
| Agregar | Windows | 0,96 → 1,02 → 1 | 260 ms |
| Secundarios | Windows | 0,98 → 1,012 → 1 | 220 ms |

Si el gesto se cancela o se convierte en desplazamiento, el botón vuelve sin rebote.

**Otras animaciones**
- **Hoja:** 340 ms, desde Y 32 px pasando por −3 px hasta 0.
- **Diálogo en Windows:** 220 ms, escala 0,97 → 1,008 → 1.
- **Cierre:** 140 ms, sin rebote.
- **Arco que se abre:** 0° → −28° → −22° en 280 ms.
- **Error:** sacudida de ±4 px en 220 ms.
- **Fila nueva:** Y −8 → 2 → 0 en 260 ms, con un resaltado dorado del 8 % que se desvanece en 600 ms.
- **Borrar:** desvanecer en 120 ms y cerrar el hueco en 180 ms, sin resorte.
- **Aviso:** opacidad y Y 6 → 0 en 160 ms.

**Fuera de alcance por ahora:** cascada inicial, tema claro, medidor de contraseña, bloqueo global, carpetas y navegación lateral.

---

# Ronda 3: eliminar rasgos de interfaz genérica hecha con IA

Ambos investigamos en internet por separado.

**Fuentes de Codex:**
- [Superdesign, 2026](https://superdesign.dev/blog/why-ai-design-looks-generic)
- [r/vibecoding, 2025](https://www.reddit.com/r/vibecoding/comments/1oskop4/)
- [guía frontend-design de Anthropic](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

**Fuentes de Claude:**
- [noqta.tn, 2026](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026)
- [daisyUI: cómo hacer la UI de IA menos genérica](https://trends.daisyui.com/how-to-make-ai-ui-less-generic/)
- [prg.sh: el sitio de gradiente violeta](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)

**Rasgos señalados:**
- Inter, Roboto o la fuente del sistema por defecto.
- Gradientes violetas.
- Iconos grandes sobre cada título.
- Etiquetas en mayúsculas con espaciado ancho.
- Redondeado indiscriminado.
- Sombras suaves por todas partes.
- Modo oscuro con acento brillante.
- Textos vagos.

Coincidimos en que ningún rasgo aislado delata la IA. Lo que la delata es la acumulación de decisiones intercambiables.

## Acuerdo

- **Tipografía:**
  - IBM Plex Sans 400/500/600, empaquetada en `web/fonts` con la licencia SIL OFL 1.1 y sin internet.
  - Cuerpo de 16/23 px en Android y 15/22 px en Windows; metadatos de 13/18 px con cifras tabulares.
  - IBM Plex Mono 500 solo en las insignias de extensión.
- **Marca en Android:** bocallave dorada de 40 px sin baldosa, sobre "OpenSesame" en 16 px/600, con 8 px de separación.
- **Etiquetas:** "Bóveda" en escritura normal, sin mayúsculas forzadas ni espaciado.
- **Sin iconos redundantes:** sin candado en el estado vacío (40 px de padding) y sin iconos por párrafo en la ayuda.
- **Forma:** insignias con radio de 4 px; el FAB con una sola sombra `0 3px 8px #00000040`.
- **Rebotes:**
  - Se mantienen los acordados para Agregar, los botones, las filas y el ⋮.
  - El ojo y la ayuda bajan a 0,97 y vuelven en 120 ms sin sobreimpulso.
- **Sin cambios:**
  - Paleta, tema oscuro con dorado, lista compacta, FAB "+", lupa y candado.
  - Español/inglés y los textos explicativos.
