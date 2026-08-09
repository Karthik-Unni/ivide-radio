# Ivide Radio

A synced "radio" site for a Kerala private bus playlist. Every visitor hears
the same song at the same moment, like a real radio station — no login, no
backend database of users, just a shared clock.

## How it works

- `playlist.json` is your song list (YouTube video ID, title, artist, duration in seconds).
- `api/now-playing.js` computes which track "should" be playing right now based
  on elapsed time since a fixed start date (`EPOCH_START`), the same way a real
  radio station's clock works. Every visitor's browser asks this endpoint and
  gets the same answer.
- The actual audio plays through YouTube's own embedded player
  (`YT.Player`), seeked to the right position. This keeps playback within
  YouTube's own terms — you're not extracting or re-hosting audio, just
  embedding their official player.
- `api/online.js` is a live "N online" counter backed by Upstash Redis (free
  tier). Each browser tab pings it every 15s; anyone who pinged in the last
  30s counts as online.
- Spotify / YT Music buttons just link out to your real playlists on those
  platforms — same as the reference site.

## 1. Build your playlist (from your real Spotify playlist)

This pulls every track from your Spotify playlist via Spotify's API (all
340 of them, not just what a webpage happens to load), then finds each one
on YouTube (search only — nothing is downloaded) and writes `playlist.json`.

1. Go to https://developer.spotify.com/dashboard → log in → **Create App**.
   - App name / description: whatever you like (e.g. "Ivide Radio").
   - Redirect URI: `http://localhost:3000/callback` (required by the form, unused here).
2. Copy the **Client ID** and **Client Secret** from the app settings.
3. Copy `.env.example` to `.env` and fill in your credentials and playlist URL:
   ```bash
   cp .env.example .env
   ```
4. Install dependencies and run the importer:
   ```bash
   npm install
   npm run import:spotify
   ```
   It'll page through all tracks, search YouTube for each, and write a
   fresh `playlist.json`. Takes a few minutes for a few hundred songs.
5. Check the terminal output — any `MISS`/`FAIL` lines mean that track
   wasn't matched; add those manually if you want them (same format as
   other entries: `id`, `title`, `artist`, `duration` in seconds).
6. Also skim `playlist.json` afterward for obviously wrong matches (a
   search can occasionally grab a cover or lyric video instead of the
   original) and swap in the correct `id` where needed.

Finally, update `SPOTIFY_PLAYLIST_URL` and `YTMUSIC_PLAYLIST_URL` at the
top of `app.js` with your real playlist links (these are just the "open in
Spotify / YT Music" buttons, separate from the import step above).

*(There's also `tracks.txt` + `build_playlist.py` in this folder from an
earlier, more manual approach — you can ignore/delete those now that the
Spotify importer covers the same job end to end.)*

## 2. Set up the online counter (Upstash Redis, free)

1. Go to https://upstash.com → sign up free → **Create Database** (Redis, any region).
2. On the database page, copy the **REST URL** and **REST Token**.
3. You'll paste these into Vercel as environment variables in step 4 below.
   (Without them the site still works, it just won't have a real shared
   online count.)

## 3. Test locally

```bash
npm install -g vercel
cd ivide-radio
vercel dev
```

Open the local URL it prints. You should see the sound gate, then the board
and player once you click it.

## 4. Deploy to Vercel

```bash
npm install -g vercel
cd ivide-radio
vercel login
vercel
```

Follow the prompts (link to a new project, defaults are fine). Then:

1. Go to your project on https://vercel.com/dashboard → **Settings → Environment Variables**.
2. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from step 2.
3. Redeploy: `vercel --prod`.

## 5. Custom domain

1. Buy a domain (Namecheap, Porkbun, GoDaddy — Porkbun tends to be cheapest).
   Something short and in the spirit of the original: `ivideradio.fm`,
   `bussfm.in`, `kslfm.wtf`, `nadanpattu.fm` — whatever you like.
2. In Vercel: **Settings → Domains → Add**, type your domain.
3. Vercel shows you the DNS records to add (usually an A record or CNAME).
   Add those in your registrar's DNS panel.
4. Wait a few minutes for DNS to propagate — Vercel auto-issues HTTPS once it verifies.

That's it — `yourdomain.com` now points at the live site.

## Notes / things to adjust to taste

- `EPOCH_START` in `api/now-playing.js` is the anchor time the whole "radio
  schedule" is calculated from. Set it once at launch and leave it — changing
  it later just reshuffles which song plays when, it won't break anything.
- Browsers block autoplay-with-sound until a user interacts with the page,
  which is why there's a "tap to board the bus" gate before playback starts.
- This is a fan/hobby project pattern (same as the reference site) — it
  streams via YouTube's own player rather than re-hosting audio. If you plan
  to grow this beyond a small personal project, it's worth being ready to
  swap out or remove specific tracks on request.
