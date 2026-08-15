# Adivina la canción

Juego de buzzer musical presencial. Suena un fragmento de una canción de
YouTube y los jugadores compiten por pulsar primero desde su celular. Quien
acierta título y artista puntúa: 5 puntos si pulsó en los primeros 5 segundos,
3 en los primeros 10, 1 en los primeros 30. Fallar cuesta 1 punto y te deja
fuera de esa canción.

## Montar una partida

1. Abre `/host` en la laptop conectada al parlante, en pantalla completa.
2. Los jugadores escanean el QR y escriben su nombre.
3. Pulsa **Empezar partida**. El jugador que pulsa dice su respuesta en voz
   alta y tú juzgas con ✅ o ❌.

Inicia sesión en YouTube en ese navegador para que Premium quite los anuncios.

## Desplegar

1. `npx vercel --prod`
2. En el dashboard de Vercel, entra al proyecto → **Settings → Environment
   Variables** y agrega `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (las mismas claves de tu `.env.local`).
3. Vuelve a desplegar (`npx vercel --prod` otra vez, o un redeploy desde el
   dashboard) para que las variables tomen efecto: un build ya hecho no las
   recoge solo.

Inicia sesión en YouTube en el navegador de la laptop que usará `/host` para
que Premium quite los anuncios.

## Antes de la primera partida

Con dos celulares reales, antes de jugar en serio:

- [ ] el QR abre `/play` y ambos celulares aparecen en la lista del anfitrión
- [ ] el audio suena sin anuncios y sin demora perceptible
- [ ] pulsar corta la música al instante y bloquea al otro celular
- [ ] ✅ otorga los puntos que muestra la pantalla
- [ ] ❌ resta un punto, tacha al jugador en el marcador y **la música
      retoma justo donde se cortó**
- [ ] sin que nadie pulse, la canción se reinicia a los 5 s y a los 15 s
      (tramos 2 y 3)
- [ ] no hay silencio audible entre canciones
- [ ] bloquear y desbloquear un celular a mitad de ronda lo trae de vuelta
      con su nombre y su puntaje
- [ ] recargar `/host` a mitad de partida conserva el marcador y la ronda
- [ ] "Saltar canción" avanza sin puntuar

`npm run import-playlist` nunca se ha corrido contra la API real de YouTube;
la primera importación real puede sacar a la luz problemas nuevos.

## Desarrollo

```bash
npm install
cp .env.local.example .env.local   # rellenar con las claves de Supabase
npm run dev
npm test
npm run check-songs                # valida songs.json contra YouTube
```

## Armar el mazo

Importa una playlist de YouTube entera (necesita `YOUTUBE_API_KEY`, gratis en
Google Cloud Console con *YouTube Data API v3* habilitada):

```bash
export YOUTUBE_API_KEY=...
npm run import-playlist -- "https://www.youtube.com/playlist?list=..."
```

Eso rellena `videoId`, `title` y una conjetura de `artist`. Faltan dos campos
que **no se pueden automatizar**:

- `year` — YouTube no lo sabe.
- `startSeconds` — el segundo donde la canción **se reconoce**, saltando la
  intro. Es lo que decide si el juego engancha.

`npm run check-songs` te los reclama uno por uno hasta que el mazo esté listo,
y de paso verifica que ningún video esté bloqueado para embebido.
