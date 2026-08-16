# Juego de buzzer musical estilo Hitster — Diseño

Fecha: 2026-08-15
Estado: aprobado, pendiente de plan de implementación

## 1. Qué es

Un juego de fiesta, presencial, para adivinar canciones. Suena un fragmento
corto y los jugadores compiten por pulsar primero un botón en su celular.
Quien pulsa dice en voz alta **título y artista**; el anfitrión juzga. Cuanto
antes se pulse, más puntos vale acertar.

Una laptop hace de escenario: proyecta el marcador y saca el audio por el
parlante. Los celulares son solo botones.

### No objetivos

Estas cosas quedan explícitamente fuera de esta versión:

- Jugar en remoto (cada jugador con su propio audio). El diseño asume una
  única fuente de sonido en la sala.
- Corrección automática de respuestas por texto. Juzga una persona.
- Cuentas de usuario, historial de partidas o estadísticas persistentes.
  Esto se refiere a historial *de cara al jugador*: no hay pantalla de
  partidas pasadas, ni marcador entre noches, ni nada que un jugador pueda
  consultar. La memoria interna que el anfitrión guarda en `localStorage`
  para no repetir canciones entre partidas de la misma noche (qué ids de
  canción sonaron recientemente) no es esto: no se muestra en ninguna
  pantalla, no identifica partidas ni fechas, y solo existe para decidir qué
  mazo mezclar la próxima vez que se pulsa "Nueva partida".
- Edición de la lista de canciones desde la interfaz.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Fuente de audio | YouTube embebido (IFrame Player API) | El usuario tiene YouTube Premium: sin anuncios en el navegador anfitrión logueado. Catálogo ilimitado, sin gestionar archivos. |
| Buzzer | Celular por WebSocket gestionado, teclado como respaldo | Escala a cualquier número de jugadores y se siente como un concurso. El teclado cubre el caso de wifi caída. |
| Hosting | Vercel | Sin instalar nada en la laptop, sin IPs de red local; el QR funciona incluso con datos móviles. |
| Tiempo real | Supabase Realtime (canales broadcast) | Vercel no soporta WebSockets. Supabase deja la puerta abierta a persistir listas más adelante. |
| Autoridad del juego | La página del anfitrión | Elimina backend y base de datos. Un solo árbitro del orden de pulsaciones. |
| Puntuación | Por tramo: 5 / 3 / 2 | Premia la velocidad, que es el objetivo declarado del juego. |
| Acierto válido | Título **y** artista, ambos | Exige saberse la canción de verdad. |
| Fallo | −1 punto y eliminado de esa canción | Desincentiva pulsar a ciegas. |
| Progresión de tramos | Reinicia desde el principio, más largo | El reconocimiento musical funciona sobre el mismo gancho con más contexto. |
| Pausa entre tramos | El anfitrión lanza cada tramo | *Revisado tras usarlo:* encadenar no funcionaba. Entre tramos la sala está discutiendo qué canción es, y una música que rearranca sola es indistinguible de la que ya sonaba — nadie sabía en qué tramo estaba. El anfitrión sostiene la sala y arranca cada tramo a propósito. Se puede pulsar durante la espera, y vale lo que valía el tramo que acaba de sonar. |

## 3. Reglas del juego

### La ronda

Se saca una canción al azar del mazo, sin repetir dentro de la partida. El
audio arranca en `startSeconds` y avanza por tres tramos, cada uno lanzado a
mano por el anfitrión:

| Tramo | Suena | Vale |
|---|---|---|
| 1 | de `startSeconds` a `startSeconds + 5` | 5 puntos |
| 2 | de `startSeconds` a `startSeconds + 10` | 3 puntos |
| 3 | de `startSeconds` a `startSeconds + 15` | 2 puntos |

Cada tramo **vuelve a empezar** en `startSeconds`, no continúa donde quedó el
anterior. La canción suena unos 30 segundos en total si nadie pulsa.

Entre un tramo y el siguiente la ronda queda **esperando**: la música para y
el anfitrión decide cuándo suena el tramo siguiente. Los celulares siguen
activos durante esa espera y una pulsación vale los puntos del **tramo que
acaba de sonar**, no del que está por venir.

Los límites son cerrados por abajo y abiertos por arriba, medidos sobre el
segundo de reproducción del tramo en curso: una pulsación en 4.999 s del tramo
1 suena todavía dentro del tramo 1 y vale sus 5 puntos. En 5.000 s el tramo 1
**termina de sonar** — ahí acaba su reproducción —, pero eso no cambia lo que
vale una pulsación: la ronda pasa a esperando y, como toda pulsación durante
la espera, sigue valiendo los 5 puntos del tramo que acaba de sonar (ver más
abajo), no los del tramo 2.

Si termina el tramo 3 sin pulsaciones, se revela la canción y nadie puntúa.

### Al pulsar

1. El audio se corta en seco.
2. El nombre del jugador ocupa la pantalla del anfitrión.
3. Todos los celulares se bloquean.
4. El jugador dice título y artista en voz alta.
5. El anfitrión toca ✅ o ❌.

**✅ Acierto** — el jugador suma los puntos del tramo en el que pulsó. Se
revela la carta (título, artista, año) y se pasa a la siguiente canción.

**❌ Fallo** — el jugador pierde 1 punto y queda eliminado **de esa canción**
(no de la partida). Los demás se desbloquean y la ronda vuelve a **esperando**,
sobre el mismo tramo y con el corte anotado al milisegundo: cuando el anfitrión
pulsa, el audio **retoma exactamente donde se cortó**, nunca desde el
principio. Un jugador eliminado vuelve a estar disponible en la canción
siguiente.

Si todos los jugadores quedan eliminados en una canción, la ronda se cierra de
inmediato: se revela y nadie puntúa.

### Regla crítica: el tramo se congela al pulsar

El valor de la respuesta se fija en el **instante de la pulsación**, no cuando
el anfitrión emite su juicio. Alguien que pulsa en el segundo 4.9 se lleva 5
puntos aunque el anfitrión tarde medio minuto en decidir.

### Fin de partida

La partida dura un número de canciones fijado al empezar (por defecto 20, o el
tamaño del mazo si es menor). Gana quien más puntos tenga. Los puntos pueden
ser negativos.

## 4. Datos de las canciones

Un archivo `songs.json` versionado en el repo. Cada entrada:

```json
{
  "id": "smells-like-teen-spirit",
  "videoId": "hTWKbfoikeg",
  "title": "Smells Like Teen Spirit",
  "artist": "Nirvana",
  "year": 1991,
  "startSeconds": 42
}
```

- `id` — identificador estable, único en el archivo.
- `videoId` — id de YouTube de 11 caracteres.
- `startSeconds` — dónde arranca cada tramo. Es la pieza que decide si el
  juego engancha o frustra: hay que elegir el punto donde la canción **se
  reconoce**, saltando intros largas.
- `year` — se muestra al revelar. No se usa para puntuar en esta versión.

Como el juicio es humano, no existe comparación de texto: nada de normalizar
acentos, artículos ni "feat.". Esto elimina la parte más frágil de este tipo
de juegos.

### Validación de la lista

Un script `npm run check-songs` recorre `songs.json` y reporta, para cada
canción: que el `videoId` exista, que el video permita embebido, y que su
duración sea mayor que `startSeconds + 15` (la duración del tramo 3). Falla
con código distinto de cero si alguna entrada no pasa, para poder engancharlo
a CI más adelante.

Existen videos que bloquean el embebido; descubrirlo en plena fiesta es el
peor momento posible.

## 5. Arquitectura

### Piezas

```
┌──────────────────────┐        ┌───────────────────┐
│  /host  (laptop)     │◄──────►│ Supabase Realtime │◄──────► /play (celular)
│  ─ autoridad         │ canal  │  sala:KZTR        │         /play (celular)
│  ─ mazo + marcador   │        └───────────────────┘         /play (celular)
│  ─ motor de juego    │
│  ─ 2 iframes YouTube │
└──────────────────────┘
```

No hay backend propio ni base de datos. Vercel sirve dos rutas estáticas. La
clave anónima de Supabase viaja en el cliente, que es su uso previsto; solo se
usan canales broadcast, sin tablas ni RLS que configurar.

### Sala y unión

El anfitrión genera un **código de 4 letras** (`KZTR`) al crear la partida.
Ambas páginas se suscriben al canal `sala:KZTR`. La pantalla del anfitrión
muestra un QR que apunta a `https://<app>.vercel.app/play?sala=KZTR`, junto a
la lista de jugadores conectados.

### Por qué el anfitrión es la autoridad

La página del anfitrión posee el mazo, el reloj de tramos y el marcador. Los
celulares solo emiten `BUZZ`. **Gana el primer mensaje que llega al
anfitrión**, y todo lo demás se descarta hasta que se resuelva.

La ruta es idéntica para todos los jugadores (celular → Supabase → laptop,
~50-150 ms), así que la carrera es limpia sin necesidad de sincronizar relojes
ni confiar en marcas de tiempo del cliente, que serían manipulables.

*Mejora futura, no incluida:* medir la latencia de cada jugador al unirse y
compensarla al ordenar pulsaciones. Solo vale la pena si en la práctica se
observa que algún dispositivo llega sistemáticamente tarde.

### Mensajes del canal

Del anfitrión a los jugadores:

- `STATE` — estado actual: fase de la ronda, quién está bloqueado, quién
  eliminado, marcador. Se emite en cada cambio y sirve también para que un
  celular que se reconecta se ponga al día de una vez.
- `BUZZ_ACCEPTED` — identifica al ganador de la pulsación.

De los jugadores al anfitrión:

- `JOIN` — id de jugador (persistido) y nombre.
- `BUZZ` — id de jugador.

Los mensajes del jugador que no correspondan a la fase actual se ignoran en
silencio: un `BUZZ` de alguien bloqueado, eliminado o llegado tarde no altera
nada.

### Fallos previstos

**El celular se duerme o cambia de red.** Supabase reconecta solo. La
identidad del jugador (id y nombre) vive en `localStorage`, así que al volver
recupera su sitio y sus puntos. El siguiente `STATE` lo resincroniza.

**Se recarga la página del anfitrión.** El estado completo de la partida se
persiste en `localStorage` del anfitrión en cada cambio y se restaura al
cargar. Sin esto, un toque accidental de F5 borraría la partida.

**Hueco de silencio entre canciones.** Se usan **dos iframes de YouTube
alternándose**: mientras uno reproduce, el otro precarga en silencio la
canción siguiente (cargar, silenciar, reproducir, pausar, buscar
`startSeconds`). Sin doble búfer habría uno o dos segundos de nada entre
canciones, y eso corta el ritmo de la fiesta.

**Un video resulta imposible de reproducir en plena partida.** El anfitrión
tiene un botón de "saltar canción" que descarta la ronda sin puntuar y sigue.

**Autoplay bloqueado por el navegador.** El botón "Empezar partida" es el
gesto de usuario que desbloquea el audio; a partir de ahí la reproducción
programática funciona.

### Modo teclado de respaldo

Si no hay wifi utilizable, el anfitrión puede registrar jugadores localmente y
asignar a cada uno una tecla. Los eventos de teclado entran al **mismo motor de
juego** por la misma interfaz que las pulsaciones remotas; no hay una segunda
implementación de las reglas.

## 6. Estructura del código

El principio: **las reglas del juego no saben que existen YouTube, Supabase ni
el navegador.**

- `src/game/` — motor puro. Máquina de estados de la ronda, cálculo de tramo y
  puntos, gestión de eliminados, marcador. Sin DOM, sin red, sin temporizadores
  propios: recibe eventos (`tick`, `buzz`, `judge`) y devuelve el estado nuevo.
  Aquí vive casi toda la complejidad y casi todos los tests.
- `src/audio/` — interfaz `AudioPlayer` (`preload`, `playSegment`, `pause`,
  `resume`, `stop`) con la implementación de YouTube detrás, incluido el doble
  búfer de iframes.
- `src/realtime/` — interfaz `Channel` (`publish`, `subscribe`) con la
  implementación de Supabase detrás.
- `src/app/host/` y `src/app/play/` — las dos pantallas, tan finas como se
  pueda: renderizan estado y emiten eventos.

Pila: Next.js (App Router) + TypeScript + Tailwind. Sin rutas de API.

## 7. Pruebas

**Motor de juego (unitarias, sin navegador).** Es la única parte donde una
regla puede estar sutilmente mal y arruinar una partida:

- Pulsar en el segundo 4.9 vale 5 puntos; en el 5.1, 3 puntos; en el 10.1, 2.
- El valor se fija al pulsar y no cambia aunque el juicio tarde.
- Un fallo resta 1 punto, elimina a ese jugador de la canción y **no** afecta
  a los demás.
- Tras un fallo, el audio retoma en el punto exacto del corte y dentro del
  mismo tramo.
- Un jugador eliminado vuelve a estar disponible en la canción siguiente.
- Dos pulsaciones casi simultáneas producen exactamente un ganador.
- Un `BUZZ` de un jugador bloqueado o eliminado no tiene efecto alguno.
- Si todos quedan eliminados, la ronda se cierra sin puntos.
- Si nadie pulsa en los tres tramos, la ronda se cierra sin puntos.
- Ninguna canción se repite dentro de una partida.

**Adaptadores.** `AudioPlayer` y `Channel` se prueban con dobles falsos; la
integración real con YouTube y Supabase se verifica a mano.

**Prueba de humo manual**, antes de la primera partida real: dos teléfonos,
unirse, pulsar, acertar, fallar, reconectar un teléfono a mitad de ronda,
recargar la página del anfitrión.

## 8. Configuración

Valores en un único módulo de configuración, para ajustarlos entre partidas
sin tocar la lógica: duración de los tramos (5/10/15), puntos por tramo
(5/3/2), penalización por fallo (−1) y número de canciones por partida (20).

Variables de entorno en Vercel: `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 9. Dirección futura: fuentes de música dinámicas

**Decidido el 2026-08-15, fuera de alcance de esta versión.** El objetivo a
medio plazo es que al montar la partida se elija la fuente: **YouTube o
Spotify**, y que añadir una tercera no obligue a tocar las reglas del juego.

### Lo que cambia en el diseño

Hoy `Song` lleva un `videoId` de YouTube y `AudioPlayer` es la única costura.
Para varias fuentes hacen falta dos abstracciones, no una:

- **`MusicSource`** — de dónde sale el mazo. Devuelve canciones con título,
  artista, año y una referencia opaca de reproducción. `videoId` pasa a ser
  `sourceRef: { provider: 'youtube' | 'spotify'; ref: string }`.
- **`AudioPlayer`** — ya existe y ya es la costura correcta. La implementación
  de Spotify entra por ahí sin tocar el reducer.

El motor de juego no debería enterarse de nada de esto: sigue recibiendo
eventos y devolviendo estado.

### Lo que Spotify mejora

- **Metadata automática y correcta.** Título, artista y año de publicación
  vienen de la API. Desaparece el trabajo manual de rellenar `year`, que hoy
  es la mitad del esfuerzo de curar el mazo.
- **El mazo es la playlist.** Sin importador, sin `songs.json`: se elige una
  playlist propia al empezar y ya está.
- **Corte preciso.** El Web Playback SDK permite arrancar en `position_ms` y
  pausar, así que los tramos de 5/10/15 s funcionan igual de bien.

### Lo que Spotify complica

- **Exige cuenta Premium** en el navegador anfitrión, y OAuth con PKCE más una
  redirect URI registrada en Vercel. Es la primera vez que el proyecto
  necesitaría gestionar tokens.
- **`startSeconds` sigue siendo manual.** Los endpoints de *audio-features* y
  *audio-analysis*, que en teoría permitirían detectar el estribillo, quedaron
  deprecados para aplicaciones nuevas a finales de 2024. Conviene verificar su
  estado antes de contar con ellos.
- **El mazo deja de ser reproducible.** Una playlist puede cambiar entre
  partidas, y las canciones pueden desaparecer del catálogo por región.

### Camino sugerido

1. Extraer `MusicSource` con la implementación de YouTube actual detrás, sin
   cambiar comportamiento y con los tests existentes en verde.
2. Añadir el selector de fuente en la pantalla de lobby.
3. Implementar `SpotifyMusicSource` + `SpotifyAudioPlayer` detrás de las
   mismas interfaces.

El paso 1 es el que vale la pena hacer bien: si las interfaces quedan
limpias, Spotify es trabajo aditivo.

## 10. Otras mejoras posibles, fuera de alcance

- Lista de canciones en una tabla de Supabase, con pantalla para añadir desde
  el móvil, en lugar de editar JSON y redesplegar.
- Puntuar también el año, al estilo de la línea temporal de Hitster.
- Mazos temáticos (décadas, géneros) filtrando por etiquetas.
- Compensación de latencia por jugador.
- Efectos de sonido para el buzzer y el acierto.
