/**
 * Pulls every track from a Spotify playlist via the Spotify Web API,
 * then finds a matching YouTube video for each one (search only — this
 * never downloads or extracts audio), and writes playlist.json.
 *
 * Usage:
 *   npm install spotify-web-api-node dotenv yt-search
 *   node scripts/importSpotify.js
 */

require("dotenv").config();
console.log(process.env.SPOTIFY_CLIENT_ID);
console.log(process.env.SPOTIFY_CLIENT_SECRET);
const fs = require("fs");
const path = require("path");
const SpotifyWebApi = require("spotify-web-api-node");
const yts = require("yt-search");

const PLAYLIST_URL_OR_ID = process.env.SPOTIFY_PLAYLIST_URL || "";
const OUTPUT_FILE = path.join(__dirname, "..", "playlist.json");
const SEARCH_DELAY_MS = 400; // be polite to YouTube's search endpoint

function extractPlaylistId(input) {
  const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : input.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Step 5: authenticate
async function getSpotifyClient() {
  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  try {
    const data = await spotifyApi.clientCredentialsGrant();
    console.log("✅ Got Spotify access token");
    spotifyApi.setAccessToken(data.body.access_token);
    return spotifyApi;
  } catch (err) {
    console.log("❌ Token request failed");
    console.log(err.statusCode);
    console.log(err.body);
    throw err;
  }
}

// Step 7: page through all tracks, 100 at a time
async function getAllTracks(spotifyApi, playlistId) {
  const tracks = [];
  let offset = 0;

  while (true) {
    let res;

try {
  res = await spotifyApi.getPlaylistTracks(playlistId, {
    offset,
    limit: 100,
  });
} catch (err) {
  console.log("====== SPOTIFY PLAYLIST ERROR ======");
  console.log("Status:", err.statusCode);
  console.log("Body:", err.body);
  console.log("Message:", err.message);
  throw err;
}

    if (res.body.items.length === 0) break;

    for (const item of res.body.items) {
      const track = item.track;
      if (!track || !track.name) continue; // skip removed/local tracks

      tracks.push({
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        spotifyDurationSec: Math.round(track.duration_ms / 1000),
      });
    }

    console.log(`Fetched ${tracks.length} tracks so far...`);
    offset += 100;
  }

  return tracks;
}

// Step 8-9: build a search query per track, find it on YouTube
async function findOnYouTube(track) {
  const query = `${track.title} ${track.artist} official audio`;
  const result = await yts(query);
  const video = result.videos[0];
  if (!video) return null;

  return {
    id: video.videoId,
    title: track.title,
    artist: track.artist,
    // Use the YouTube video's own duration (not Spotify's) — this is what
    // will actually be playing, and the radio-sync math needs it to match.
    duration: video.seconds || track.spotifyDurationSec,
  };
}

async function main() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error("Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const playlistId = extractPlaylistId(PLAYLIST_URL_OR_ID);
  console.log(`Playlist ID: ${playlistId}`);

  const spotifyApi = await getSpotifyClient();
  const tracks = await getAllTracks(spotifyApi, playlistId);
  console.log(`Total tracks pulled from Spotify: ${tracks.length}`);

  const results = [];
  const failed = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    try {
      const match = await findOnYouTube(track);
      if (match) {
        results.push(match);
        console.log(`[${i + 1}/${tracks.length}] OK   ${track.title} -> ${match.id} (${match.duration}s)`);
      } else {
        failed.push(track.title);
        console.log(`[${i + 1}/${tracks.length}] MISS ${track.title} — no YouTube result`);
      }
    } catch (e) {
      failed.push(track.title);
      console.log(`[${i + 1}/${tracks.length}] FAIL ${track.title} — ${e.message}`);
    }
    await sleep(SEARCH_DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");

  console.log(`\nDone. ${results.length} tracks written to playlist.json.`);
  if (failed.length) {
    console.log(`${failed.length} tracks failed to match — add these manually if you want them:`);
    failed.forEach((t) => console.log(`  - ${t}`));
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
