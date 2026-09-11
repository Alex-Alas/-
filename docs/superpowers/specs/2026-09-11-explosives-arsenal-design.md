# Especificación de Diseño: Lanzacohetes, Bombas y Reacción en Cadena

## 1. Arquitectura y Componentes

### 1.1 Lanzacohetes (`src/weapons/rocket.js`)
- **Slot:** 4, Nombre: `ROCKET`, Color: `0xff5a5a`.
- **Controles:**
  - `LMB`: Dispara un proyectil guiado hacia la mira desde `muzzle`.
  - `Hint`: `{ lmb: 'disparar cohete', rmb: '', extra: 'retroceso al disparar' }`.
  - Cadencia: ~1.1 disparos por segundo (`cooldown = 0.909 s`).
- **Balística y Prevención de Tunneling:**
  - Proyectil ligero no-RigidBody (malla de cono estilizado con `makeMaterial(0xff5a5a)`).
  - En cada `updateRockets(dt)`:
    - Gravedad: `vel.y += -6.0 * dt`.
    - Detección continua de impacto: `raycast(posAnterior, dir, distanciaPaso + radio)`.
    - Detecta tanto cuerpos dinámicos como estáticos y el suelo.
    - Al impactar: `explode(hit.point, { power: 780, radius: 10 })` y destrucción del cohete.
    - Estela de fragmentos con `spawnShards` cada ~0.03 s.
    - Tiempo de vida máximo: 5 s.
  - Retroceso al disparar: `player.vel.addScaledVector(aim.dir, -4.8)`.

### 1.2 Bombas Remotas (`src/weapons/bomb.js`)
- **Slot:** 5, Nombre: `BOMB`, Color: `0xffd76a`.
- **Controles:**
  - `LMB`: Coloca una bomba adherida a la superficie bajo la mira (`hit.point + hit.normal * radius`).
  - `RMB`: Detonación secuencial en cadena de todas las bombas activas con ~90 ms de separación entre cada una.
  - `R`: Retira todas las bombas colocadas sin detonarlas (`removeBody`).
  - `Hint`: `{ lmb: 'colocar bomba', rmb: 'detonar todas', extra: 'R: retirar bombas' }`.
- **Física y Efectos:**
  - Malla esférica chica con `RigidBody` (`radius = 0.22`, `mass = 2`, `friction = 0.8`, `restitution = 0.15`).
  - Parpadeo periódico mientras están armadas (`scale` o alternando color de material).
  - Al detonar cada una: `explode(b.pos, { power: 700, radius: 9 })` y `removeBody(b)`.

### 1.3 Reacción en Cadena de Barriles (`src/entities/explosive.js`)
- Monitorea todos los cuerpos en el mundo que posean `body.def?.explosive` (como el prop `'boom'`).
- **Suscripción a Explosiones:**
  - Al recibir `events.on('explosion', ({ point, radius }))`, cualquier barril a distancia `<= radius` enciende su mecha.
- **Detonación por Impacto Fuerte:**
  - Si en un frame `|vel - prevVel| > 22 u/s`, se enciende la mecha.
- **Mecha Escalonada:**
  - Duración aleatoria entre 120 ms y 260 ms (`0.12 + Math.random() * 0.14 s`).
  - Parpadeo visual durante la mecha activa.
  - Al expirar: llamada a `explode(body.pos, { power: body.def.explosive.power, radius: body.def.explosive.radius })` y `removeBody(body)`.
- **Protección Antirecursión:**
  - Flags explícitos `body._fuseActive` y `body._exploded`.
  - Un barril con mecha no vuelve a encenderse y no puede ser detonado dos veces.

### 1.4 Integración en el Frame Loop (`src/main.js`)
- Importación de `src/weapons/rocket.js` y `src/weapons/bomb.js`.
- Registro de `updateRockets(dt)` y `updateExplosives(dt)` en el bucle principal `loop(now)`.
