const playlist = require("../playlist.json");

// Fixed reference point so every visitor's server computes the same position.
// Change this once, at launch, and never again (changing it reshuffles the "radio").
const EPOCH_START = new Date("2026-01-01T00:00:00Z").getTime();

module.exports = (req, res) => {
  const totalDuration = playlist.reduce((sum, t) => sum + t.duration, 0);

  if (totalDuration === 0) {
    res.status(500).json({ error: "playlist.json has no tracks with a duration" });
    return;
  }

  const now = Date.now();
  const elapsedMs = now - EPOCH_START;
  const posInCycle = ((elapsedMs / 1000) % totalDuration + totalDuration) % totalDuration;

  let cumulative = 0;
  let current = playlist[0];
  let offset = 0;

  for (const track of playlist) {
    if (posInCycle < cumulative + track.duration) {
      current = track;
      offset = posInCycle - cumulative;
      break;
    }
    cumulative += track.duration;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    id: current.id,
    title: current.title,
    artist: current.artist,
    duration: current.duration,
    offset: Math.floor(offset),
    serverTime: now,
  });
};
