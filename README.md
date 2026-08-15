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
