# Plan de Implementación: Lanzacohetes, Bombas y Reacción en Cadena

> **Para agentes de desarrollo:** Usar subagentes o ejecución guiada para completar cada paso de este plan. Cada paso utiliza la sintaxis `- [ ]` para seguimiento.

**Meta:** Implementar las dos armas explosivas del kit (Lanzacohetes slot 4 y Bombas remotas slot 5) y el sistema de reacción en cadena para los barriles explosivos ('boom'), con prevención estricta de tunneling, temporización escalonada y protección antirecursión.

**Arquitectura:**
- [src/weapons/rocket.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/rocket.js): Entidad propia ligera con raycasting continuo por frame, estela de debris, retroceso y detonación en impacto.
- [src/weapons/bomb.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/weapons/bomb.js): Colocación de RigidBodies pequeños adheridos a superficies, parpadeo periódico, detonación secuencial en cadena con cola asíncrona de 90 ms y desactivación pacífica con tecla R.
- [src/entities/explosive.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/entities/explosive.js): Reacción en cadena por evento de explosión o aceleración brusca (`|dv| > 22 u/s`), mecha escalonada (120-260 ms), parpadeo visual y protección contra recursión infinita.
- [src/main.js](file:///d:/Proyectitos/Cinematic%20physics%20test/Cinematic-physics-test/src/main.js): Integración y ejecución de ciclos de actualización `updateRockets(dt)`, `updateBombs(dt)` y `updateExplosives(dt)`.

**Restricciones Globales:**
- Bajo ninguna circunstancia utilizar emojis en código, comentarios, mensajes o logs.
- Preservar todos los comentarios existentes.
- Sin tunneling de proyectiles ni errores de recursión infinita.

---

### Tarea 1: Lanzacohetes (`src/weapons/rocket.js`)

**Archivos:**
- Crear: `src/weapons/rocket.js`

- [ ] **Paso 1: Implementar `src/weapons/rocket.js`**
  - Registrar herramienta en `Tools` (slot 4, "ROCKET", color `0xff5a5a`, hint descriptivo).
  - Gestionar array de cohetes activos `rockets = []`.
  - Disparo con LMB: verificar cooldown (~0.91 s para ~1.1 disparos/s).
  - Calcular origen desde `muzzle.getWorldPosition(_muzzlePos)` y vector hacia el objetivo de la retícula (`aimHit(200)` o `aim.origin + aim.dir * 200`).
  - Velocidad inicial: 60 u/s.
  - Aplicar retroceso perceptible a `player.vel.addScaledVector(aim.dir, -4.8)`.
  - En `updateRockets(dt)`:
    - Gravedad: `vel.y += -6.0 * dt`.
    - Detección de impacto: `raycast(posAnterior, dir, distanciaPaso + radio)`.
    - Al impactar: llamar a `explode(hit.point, { power: 780, radius: 10 })` y eliminar cohete.
    - Estela de fragmentos: emitir con `spawnShards(pos, 1, contraVel)` cada intervalo de ~0.03 s.
    - Tiempo de vida: destruir si supera 5 s.

---

### Tarea 2: Bombas Remotas (`src/weapons/bomb.js`)

**Archivos:**
- Crear: `src/weapons/bomb.js`

- [ ] **Paso 1: Implementar `src/weapons/bomb.js`**
  - Registrar herramienta en `Tools` (slot 5, "BOMB", color `0xffd76a`, hint descriptivo).
  - Gestionar lista `placedBombs = []` y cola de detonación `detonateQueue = []`.
  - LMB: disparar raycast a corto/medio alcance (`aimHit(50)`). Si hay impacto, crear un `RigidBody` esférico pequeño (`radius: 0.22`, `mass: 2`, `friction: 0.8`, `restitution: 0.15`) en `hit.point + hit.normal * 0.22`.
  - RMB: pasar todas las bombas colocadas a la cola de detonación secuencial (intervalo de ~90 ms entre explosiones consecutivas).
  - Cada detonación ejecuta `explode(pos, { power: 700, radius: 9 })` y `removeBody(b)`.
  - Tecla R (`reload`): retirar todas las bombas colocadas sin detonar mediante `removeBody(b)` y vaciar la lista.
  - Parpadeo visual en `updateBombs(dt)` mientras están armadas (pulsación de escala o alternancia de color).

---

### Tarea 3: Reacción en Cadena de Barriles (`src/entities/explosive.js`)

**Archivos:**
- Crear: `src/entities/explosive.js`

- [ ] **Paso 1: Implementar `src/entities/explosive.js`**
  - Suscripción al bus: `events.on('explosion', ({ point, radius }) => { ... })`.
  - Buscar cuerpos activos con `body.def?.explosive` dentro de la distancia de la explosión.
  - Iniciar mecha escalonada (`0.12 + Math.random() * 0.14 s`).
  - Protección antirecursión: marcar `body._fuseActive = true` y evitar reagendar si ya está encendida o detonada (`body._exploded`).
  - Detección de impacto por aceleración brusca: en `updateExplosives(dt)`, comparar `body.vel` con `body._prevVel`; si `|vel - prevVel| > 22 u/s`, encender la mecha.
  - Efecto visual: parpadeo rápido del material o escala del barril mientras la mecha esté activa.
  - Al vencer la mecha: ejecutar `explode(body.pos, { power: body.def.explosive.power, radius: body.def.explosive.radius })`, marcar `body._exploded = true` y retirar con `removeBody(body)`.

---

### Tarea 4: Integración en `main.js` y `index.js`

**Archivos:**
- Modificar: `src/main.js`
- Modificar: `src/weapons/index.js` (si se requieren hooks adicionales)

- [ ] **Paso 1: Importar y conectar los nuevos sistemas en `src/main.js`**
  - Importar `./weapons/rocket.js` y `./weapons/bomb.js`.
  - Importar `./entities/explosive.js`.
  - Añadir llamadas a `updateRockets(dt)`, `updateBombs(dt)` y `updateExplosives(dt)` en el bucle de render/física.

---

### Tarea 5: Pruebas Automatizadas y Verificación

**Archivos:**
- Crear: `tests/explosives.test.mjs`

- [ ] **Paso 1: Crear y ejecutar pruebas unitarias con Node.js**
  - Test de mecha escalonada y prevención de doble detonación / recursión infinita.
  - Test del algoritmo de barrido continuo (anti-tunneling) con velocidades de 60 u/s y 120 u/s.
  - Test de cola secuencial de bombas (intervalo de 90 ms).
- [ ] **Paso 2: Verificación de ejecución y criterios de aceptación**
  - Ejecutar tests de Node.js.
  - Validar ausencia de errores de sintaxis o importación.
