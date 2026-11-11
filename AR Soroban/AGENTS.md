# AGENTS.md — Soroban AR

Handoff para agentes IA. Leer esto antes de tocar el proyecto.

## Qué es

App web de una sola página que superpone un soroban japonés (1+4, 10 columnas) sobre la cámara web. Se controla con gestos de pulgar e índice detectados por MediaPipe Hands. No hay práctica libre: al pulsar **Comenzar** pide ejercicios de un dígito con amigo pequeño y amigo grande, en ciclos por fórmula. Uso previsto: profesor y alumno (uno por vez) comparten pantalla en Zoom, cada uno ejecuta la app localmente.

## Archivos

| Archivo | Rol |
|---|---|
| `soroban-ar.html` | **Todo el producto** (~557 líneas). HTML+CSS+JS, sin build, sin npm. Editar aquí. |
| `test-v6.js` | **Suite principal**: ejecuta el `<script>` real del HTML con DOM simulado y manos sintéticas (140 verificaciones). Acepta otra ruta de HTML como argumento. |
| `test-v5.js` | Réplica de la lógica anterior por posición (40 tests). No ejecuta el HTML y ya no refleja las zonas por punta. |
| `test-v3.js` | Réplica de coordenadas y escala (62 tests). Su selección de columna por índice mayor es anterior a la regla vigente. |
| `test-v4.js` | Lógica vieja por índice de cuenta (histórico; ya no refleja el HTML). |
| `test-v2.js`, `test-gestures.js`, `test-pipeline.js` | Versiones legacy (dead zones, clasificación). No fuente de verdad. |
| `TEST-REPORT.md` | Checklist manual viejo. Puede estar desactualizado. |
| `../soroban-interactivo.html` | App original (7682 líneas). **NO EDITAR**. Solo referencia de estilos/geometría del soroban. |

## Cómo ejecutar

1. Abrir `soroban-ar.html` en Chrome/Edge.
2. Clic en "Activar camara", aceptar permiso.
3. `node test-v6.js`, `node test-v5.js` y `node test-v3.js` para verificar lógica sin cámara.

Verificar sintaxis del HTML:

```bash
sed -n '/<script>$/,/<\/script>/p' "soroban-ar.html" | sed '1d;$d' > /tmp/check.js && node --check /tmp/check.js
```

## Privacidad / red

- Procesamiento 100% local. No se sube video a ningún servidor.
- MediaPipe se carga una vez desde CDN:
  - `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js`
- `camera_utils` se retiró: abría un segundo `getUserMedia` y su bucle se detenía con la pestaña en segundo plano. Ahora un Worker en línea marca el ritmo (`startTicker`) para que el seguimiento continúe si Zoom tapa la ventana.
- El usuario rechazó empaquetar MediaPipe localmente. No agregar dependencias.

## Reglas de negocio (inviolables)

- Pulgar sobre cuentas inferiores = **SOLO SUMAR** (mover arriba), desde la mitad inferior de una cuenta inactiva. Única excepción: las combinaciones de abajo en que baja junto con el índice sobre la cuenta superior.
- Índice sobre cuentas inferiores = **SOLO RESTAR** (mover abajo), desde la mitad superior de una cuenta activa.
- Índice sobre cuenta superior = **toggle**: baja desde su mitad superior si está inactiva; sube desde su mitad inferior si está activa.
- La cuenta solo se mueve si el dedo empuja desde el lado de su punta y dentro del ancho central. Sin cuenta bajo el dedo no hay gesto.
- Combinaciones a la vez, en la misma columna, con el pulgar en cuentas inferiores y el índice en la cuenta superior:
  - Pinza: pulgar sube e índice baja (+5 +inferiores).
  - Suben juntas: pulgar sube e índice sube la cuenta superior (-5 +inferiores).
  - Bajan juntas: pulgar baja cuentas inferiores desde su mitad superior e índice baja la cuenta superior (+5 -inferiores). 
  - Pellizco inverso: pulgar baja cuentas inferiores desde su mitad superior e índice sube la cuenta superior desde su mitad inferior; ambos se alejan de la viga (-5 -inferiores).
  - El pulgar solo puede bajar en estas dos últimas combinaciones.
- Si dos dedos compiten en una columna, prima el movimiento más largo y definido; si empatan, no se mueve nada.
- Terminología obligatoria: "cuentas inferiores" / "cuenta superior". Nunca "bolas".
- No implementar reglas de "amigo pequeño" ni gestos con otros dedos.
- Selección de columna: **manda el dedo más a la izquierda en pantalla** (índice de columna menor, mayor valor), con ambos dedos en el orden que sea, aunque ahí no tenga movimiento posible. El otro dedo queda inactivo hasta entrar en esa columna. Ejemplo: uno en decenas y otro en unidades → se trabaja en decenas.

## Lógica de gestos (estado actual)

Los valores ajustables viven en `TUNE` (guardados con la clave `sorobanAR.tune.v2`; cambiar la clave al cambiar valores por defecto, o el navegador seguirá usando los viejos) (`TUNE_DEFAULTS` al inicio del `<script>`) y se editan en vivo desde el diagnóstico; se guardan en `localStorage`. Las medidas en px son a escala 1 y se multiplican por la escala del tablero (`bs.y`):

| Valor | Por defecto | Uso |
|---|---|---|
| `TUNE.hold` | 210 ms | Tiempo con el dedo detenido antes de confirmar |
| `TUNE.travel` | 34 px | Avance mínimo en la dirección válida |
| `TUNE.tolerance` | 16 px | Desplazamiento máximo durante la espera; también es la zona de reposo |
| `TUNE.margin` | 7 px | Margen alrededor de la zona activa de cada cuenta |
| `TUNE.straight` | 0.45 | Rectitud mínima (avance neto / trayecto) |
| `TUNE.dominance` | 1.5 | Cuánto debe superar un dedo al otro para ganar |
| `TUNE.speed` | 100 px/s | Velocidad mínima del empuje, a escala 1, desde que sale de la zona de reposo. En 0 no se exige |
| `ACTION_COOLDOWN` | 500 ms | Espera por columna entre acciones (fija) |
| `PINCH_WINDOW` | 200 ms | Espera al segundo dedo de una combinación (fija) |
| `SWEEP_ARM` | 250 ms | Tiempo sobre la viga antes de poder barrer (fija) |
| `BEAM_BAND` | 25 px | Distancia a la viga para el barrido (fija) |
| `HAND_GRACE` | 250 ms | Pérdida breve de la mano que no cancela el gesto (fija) |
| `OK_LABEL_MS` | 900 ms | Tiempo visible del mensaje de éxito (fija) |

Flujo en `processInteraction()`:

1. `handleSweep()` se evalúa primero, porque las cuentas activas están pegadas a la viga.
2. `pickLeadCol()` elige la columna del dedo más a la izquierda; un gesto confirmado conserva la suya hasta terminar.
3. `updateSlot()` lleva un gesto por dedo en `slots.thumb` / `slots.index`, solo en esa columna. `findPushableBead()` usa `pushDir()` y `beadTipZone()`: mitad de la cuenta del lado de la punta y ancho central.
4. Mientras el dedo se desplaza, la espera se reinicia y el ancla se mueve con él. Ya confirmado, el gesto sobrevive si sale verticalmente, pero no si cambia de columna.
5. `trackPath()` mide el trayecto al salir de la zona de reposo; `pushMetrics()` da avance neto, rectitud y velocidad.
6. Se actualiza primero el índice, porque `pushDir()` solo habilita al pulgar para bajar si el índice ya está en la cuenta superior, en cualquiera de sus dos sentidos.
7. `decidePush()` decide: un dedo definido actúa; en combinación actúan ambos si están definidos; en cualquier otro caso con dos dedos confirmados gana el de mayor avance si supera a `TUNE.dominance`, y si no hay empate sin movimiento.
8. El objetivo sale de la cuenta tocada (`applyPush`/`earthTarget`): subir `idx+1`, bajar `idx`. Empujar una cuenta arrastra las que tiene delante.

Gestos auxiliares:

- **Barrido a 0**: dedos juntos (a menos de una columna) sobre la viga, posados `SWEEP_ARM`, y deslizar. Al avanzar media columna, cada columna recorrida queda en 0, incluida la inicial, sin saltarse columnas si el movimiento es rápido. Reemplazó al gesto anterior de dedos separados.
- **Selección**: `beadsToMove()` resalta todas las cuentas que se moverían, con brillo y una vibración leve (`.bead.touched`, `beadbuzz`). `clip-path` recorta sombras, así que el brillo va dentro de la cuenta (`::before`).
- **Mascota** (`setMascot`, tecla M): mapache SVG con estados `awake`, `focus`, `happy`, `hint`, `sleep`; solo anima `transform`. `closeAttempt()` cuenta el último motivo de cada intento fallido; a los `HINT_AFTER` da una pista según `HINTS`. Nunca toca el estado del soroban.
- **Diagnóstico** (tecla D): dibuja las zonas activas (pulgar en rojo, índice en azul), muestra el estado de cada dedo y el motivo de cada rechazo, y permite ajustar `TUNE` en vivo. Al señalar un control con el mouse, `#diagHelp` explica en términos simples qué hace (textos en `TUNE_FIELDS`). También se ve en Zoom si queda activo al compartir.
- **HUD**: `valueDisplay`, `gestureLabel`, `colDisplay`, `holdBar/holdFill`, `colIndicator`. El mensaje de hold muestra cuántas cuentas se moverán. Solo se escribe al DOM cuando algo cambia.

## Ejercicios

- **Motor**: `canDirectAdd`, `canDirectSub` y `solve()` están copiados de `../soroban-interactivo.html` (sin el modo `rtl`). `exerciseKind()` clasifica cada operación en `SF`, `BF` o `BFSF` (amigo grande cuyo complemento necesita amigo pequeño); las directas no se usan.
- **Catálogo** (`buildCatalog`): todos los ejercicios con `a` de 0 a 9, `b` de 1 a 9 y resultado de una o dos cifras; solo las restas de amigo grande parten de 10–18. Se agrupan por fórmula (`SF+4`, `BF-7`…) en el orden `EX_ORDER`: SF+, SF−, BF+, BF−, BFSF+, BFSF−, con k de 1 en adelante.
- **Ciclos**: `EX_PER_CYCLE` = 5 ejercicios de la misma fórmula (`cycleItems`, barajados y sin repetir el mismo seguido). Al terminar todas las fórmulas vuelve a empezar.
- **Flujo**: la app pone el primer número con `setValue(a)`; el estudiante hace la operación. La tarjeta `#exercise` muestra la operación, la fórmula (`formulaOf`: `+4 = +5 −1`, `amigo pequeño de 4: 1`), el progreso y las estrellas.
- **Validación** (`checkExercise`, llamada desde `applyPush` y `clearCols`): resultado → acierto, sonido y siguiente ejercicio tras `EX_NEXT_MS`. `allowedStates()` separa cada paso por columna en cuenta superior y cuentas inferiores (como `colParts()` de la app principal); vale cualquier orden y avanzar las cuentas inferiores de a poco. Fuera de eso se marca error (`#exercise.error`) y la mascota muestra la fórmula, hasta que se corrija.
- **Fin de ciclo**: fanfarria, `#bigMsg` "¡Ciclo completado!" y presentación de la fórmula siguiente.
- **Teclas**: R reinicia el ejercicio, N lo salta, S silencia; D y M siguen igual.
- **Sonidos** (`sfx`): `WIN_B64` es la constante `WIN` de `arcSfx` en la app principal (el "winner" de Desarrollo cognitivo), decodificada con Web Audio; `fanfare()` es la fanfarria sintetizada de `audio`. Se habilitan con el clic en Comenzar. `sfx.played` cuenta las reproducciones para las pruebas.

## Geometría

- Soroban DOM generado en `buildSoroban()`; una cuenta superior + 4 inferiores por columna.
- Constantes: `COLS=10, COL_W=80, SLOT=42, BEAD_W=66, BEAD_H=38, GAP=22, TRAVEL=64, BEAM_H=20`.
- Posición: fija abajo-izquierda (`left:5%; bottom:14%`, `transform-origin:left bottom`), escala `min(1.3, 68% del ancho / 800, (86% del alto - HUD_SPACE) / alto del marco)`.
- Lectura: tablero translúcido y cuentas con opacidad `.92`; no hay opacidad general. `#overlay` va encima del soroban (z-index 5) para que los dedos no queden tapados.
- Colores de cuentas inferiores por columna en `EARTH_COLORS`; superior `#FFC300`. Estilo "juguete de colores", pensado para 10 años o más.

## Coordenadas (fuente de bugs pasados — no romper)

- El video está espejado con CSS `transform:scaleX(-1)`. `videoToScreen()` invierte X: `x=(1-normX)*dw+ox`.
- El video usa `object-fit:cover`; `videoToScreen()` compensa recorte con `scale=max(cw/vw,ch/vh)` y offsets.
- El tablero tiene `transform:scale()` CSS; `getBoardScale()` y `getBeadScreenRect()` multiplican posiciones por ese factor. Sin esto, las cuentas se desalinean una columna. El rectángulo del tablero se mide en `updateSorobanBounds()` solo al cambiar el tamaño de ventana.
- Suavizado: `getVisual()` = 5 frames (dibujo), `getLogic()` = 3 frames (detección). No igualar ambos: el dibujo debe verse fluido y la lógica responder.

## Pruebas

- `node test-v6.js` → 140/140 (código real del HTML; es la única suite que detecta regresiones en él).
- `node test-v5.js` → 40/40 y `node test-v3.js` → 62/62. Copian funciones dentro del test y pasan aunque el HTML cambie: no sirven como prueba de las reglas actuales.
- `test-v4.js` prueba la lógica anterior (target por índice de cuenta); se conserva como histórico. `test-v2.js` y `test-gestures.js`/`test-pipeline.js` son legacy.
- No hay test de cámara real: MediaPipe no corre en Node. Validar en navegador.

## Limitaciones conocidas

- Las zonas por punta son pequeñas: la precisión real depende del temblor del seguimiento y debe medirse con el diagnóstico.
- Mover toda la mano con ambos dedos justo sobre las zonas de una combinación la acciona; es indistinguible de hacerla a propósito.
- `test-v3.js` aún usa `MIN_TRAVEL=45` en su simulación (stale, no afecta al HTML).
- Solo se trackea 1 mano (`maxNumHands:1`).
- Requiere Chrome/Edge con permiso de cámara.

## Historial breve

1. App base con MediaPipe + soroban DOM copiado del original.
2. Correcciones de alineación (espejado, object-fit:cover, escala CSS).
3. Sensibilidad: hold 500 ms, cooldown, MIN_TRAVEL (70→30), suavizado.
4. Reglas estrictas pulgar=sumar / índice=restar / índice=cielo toggle; se quitaron "amigos pequeños".
5. Detección a nivel de cuenta; luego objetivo por posición anclado al toque inicial para permitir multi-cuenta.
6. Gesto por dedo con espera detenida, borrar con espera, zona limitada al tablero, gracia de mano, Worker en lugar de `camera_utils`, `test-v6.js` sobre el código real.
7. Manda el dedo más a la izquierda, zona por punta de cada cuenta, movimiento definido, pinza simultánea y diagnóstico en vivo con tecla D.
8. Combinaciones en la misma dirección y barrido a 0 sobre la viga.
9. Velocidad mínima y pellizco inverso.
10. Rediseño "juguete de colores", soroban más arriba y mascota mapache.
11. Resaltado de cuentas a mover, espera de 210 ms y ejercicios guiados de amigo pequeño y amigo grande con sonidos de premio (versión actual).
