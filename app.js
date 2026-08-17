// ============================================================
// IVIDE RADIO — Apple-Style Glassmorphic Player Logic
// Kerala Private Bus Synced Radio
// ============================================================

// ---- CONFIG ----
const SPOTIFY_PLAYLIST_URL = "https://open.spotify.com/playlist/21iS4SeHFzpuWCAGIh8PFH";
const YTMUSIC_PLAYLIST_URL = "https://music.youtube.com/playlist?list=REPLACE_ME";

const spotifyLink = document.getElementById("spotify-link");
const ytmusicLink = document.getElementById("ytmusic-link");
if (spotifyLink) spotifyLink.href = SPOTIFY_PLAYLIST_URL;
if (ytmusicLink) ytmusicLink.href = YTMUSIC_PLAYLIST_URL;

// Wallpapers for Atmosphere Switching
const WALLPAPERS = [
  "assets/kerala-bus-wallpaper.jpg",
  "assets/kerala-bus-night.jpg",
  "assets/hero-bus.jpg"
];
let currentWallpaperIdx = 0;


// ============================================================
// STATE
// ============================================================

let ytPlayer = null;
let ytReady = false;
let isPlaying = false;
let currentVolume = 100;
let isMuted = false;

let currentTrackId = null;
let currentTrack = null;
let playlist = [];
let currentIndex = -1;

// When true, user has selected a track manually.
let localMode = false;


// ============================================================
// CLIENT ID FOR ONLINE COUNTER
// ============================================================

const clientId = getClientId();

function getClientId() {
  let id = sessionStorage.getItem("ivide_client_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("ivide_client_id", id);
  }
  return id;
}

// ============================================================
// ENGINE START LOADING SCREEN
// ============================================================

function playEngineStartSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();

  // Starter motor cranking — a few quick rhythmic clicks
  function crank(startTime) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(90, startTime);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.12);
  }

  const crankStart = ctx.currentTime + 0.1;
  for (let i = 0; i < 4; i++) crank(crankStart + i * 0.18);

  // Engine catching and revving up — rising rumble
  const engineStart = crankStart + 0.9;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "sawtooth";
  osc2.type = "square";
  osc1.frequency.setValueAtTime(50, engineStart);
  osc2.frequency.setValueAtTime(52, engineStart);

  osc1.frequency.exponentialRampToValueAtTime(140, engineStart + 0.5);
  osc2.frequency.exponentialRampToValueAtTime(144, engineStart + 0.5);
  osc1.frequency.exponentialRampToValueAtTime(90, engineStart + 1.2);
  osc2.frequency.exponentialRampToValueAtTime(92, engineStart + 1.2);

  gain.gain.setValueAtTime(0.001, engineStart);
  gain.gain.linearRampToValueAtTime(0.3, engineStart + 0.3);
  gain.gain.linearRampToValueAtTime(0.15, engineStart + 1.2);
  gain.gain.exponentialRampToValueAtTime(0.001, engineStart + 1.8);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(engineStart);
  osc2.start(engineStart);
  osc1.stop(engineStart + 1.8);
  osc2.stop(engineStart + 1.8);
}

const startEngineBtn = document.getElementById("start-engine-btn");
const loadingScreen = document.getElementById("loading-screen");
const loadingStatus = document.getElementById("loading-status");
const loadingBarTrack = document.getElementById("loading-bar-track");
const loadingBarFill = document.getElementById("loading-bar-fill");

if (startEngineBtn) {
  startEngineBtn.addEventListener("click", () => {
    startEngineBtn.hidden = true;
    loadingBarTrack.hidden = false;

    playEngineStartSound();

    const steps = [
      { pct: 20, text: "Cranking the engine..." },
      { pct: 45, text: "Engine started" },
      { pct: 70, text: "Tuning the radio..." },
      { pct: 100, text: "Ready to roll!" },
    ];

    steps.forEach((step, i) => {
      setTimeout(() => {
        loadingBarFill.style.width = step.pct + "%";
        loadingStatus.textContent = step.text;
      }, i * 500);
    });

    // After the sequence, reveal the site and unlock audio playback
    setTimeout(() => {
      loadingScreen.classList.add("hidden");
      setTimeout(() => { loadingScreen.style.display = "none"; }, 600);

      if (ytReady) {
        ytPlayer.unMute();
        ytPlayer.playVideo();
      }
    }, steps.length * 500 + 400);
  });
}
// ============================================================
// HELPERS
// ============================================================

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}


// ============================================================
// CLOCK
// ============================================================

function tickClock() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;

  const clockEl = document.getElementById("clock");
  if (clockEl) {
    clockEl.textContent = `${h}:${m} ${ampm}`;
  }
}
tickClock();
setInterval(tickClock, 10000);


// ============================================================
// LOAD PLAYLIST & RENDER DRAWER
// ============================================================

async function loadPlaylist() {
  try {
    const res = await fetch("/playlist.json");
    if (!res.ok) throw new Error("Could not load playlist.json");

    playlist = await res.json();
    console.log(`Loaded ${playlist.length} songs`);

    const countBadge = document.getElementById("playlist-count-badge");
    if (countBadge) {
      countBadge.textContent = `${playlist.length} tracks`;
    }

    renderPlaylistTracks(playlist);
  } catch (error) {
    console.error("Playlist loading failed:", error);
  }
}

function renderPlaylistTracks(items) {
  const container = document.getElementById("playlist-tracks-container");
  if (!container) return;

  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:rgba(255,255,255,0.5); font-size:13px;">No matching songs found</div>`;
    return;
  }

  items.forEach((track, idx) => {
    const isCurrent = currentTrackId === track.id;
    const itemEl = document.createElement("div");
    itemEl.className = `track-item ${isCurrent ? "active" : ""}`;

    const originalIdx = playlist.findIndex(t => t.id === track.id);

    itemEl.innerHTML = `
      <span class="track-num">${originalIdx + 1}</span>
      <img class="track-thumb" src="https://img.youtube.com/vi/${track.id}/hqdefault.jpg" alt="" loading="lazy" />
      <div class="track-details">
        <div class="track-item-title">${escapeHtml(track.title)}</div>
        <div class="track-item-artist">${escapeHtml(track.artist)}</div>
      </div>
      <span class="track-dur">${fmtTime(track.duration)}</span>
    `;

    itemEl.addEventListener("click", () => {
      playTrack(originalIdx);
      closeDrawer();
    });

    container.appendChild(itemEl);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


// ============================================================
// SEARCH IN PLAYLIST
// ============================================================

const searchInput = document.getElementById("playlist-search");
const clearSearchBtn = document.getElementById("clear-search-btn");

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (clearSearchBtn) clearSearchBtn.hidden = !q;

    if (!q) {
      renderPlaylistTracks(playlist);
      return;
    }

    const filtered = playlist.filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
    renderPlaylistTracks(filtered);
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    clearSearchBtn.hidden = true;
    renderPlaylistTracks(playlist);
  });
}


// ============================================================
// YOUTUBE IFRAME API
// ============================================================

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player("yt-player", {
    height: "100%",
    width: "100%",
    playerVars: {
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        ytReady = true;
        console.log("YouTube player ready");
        syncToNowPlaying();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          setPlayingUI(true);
        }
        if (e.data === YT.PlayerState.PAUSED) {
          setPlayingUI(false);
        }
        if (e.data === YT.PlayerState.ENDED && localMode) {
          playNextTrack();
        }
      },
    },
  });
};


// ============================================================
// PLAY / PAUSE UI SYNC
// ============================================================

function setPlayingUI(playing) {
  isPlaying = playing;

  if (playing) {
    document.body.classList.add("playing");
  } else {
    document.body.classList.remove("playing");
  }

  // Play/Pause Icons in Dock & Modal
  const playIcon = document.getElementById("play-icon");
  const pauseIcon = document.getElementById("pause-icon");
  if (playIcon) playIcon.hidden = playing;
  if (pauseIcon) pauseIcon.hidden = !playing;

  const modalPlayIcon = document.getElementById("modal-play-icon");
  const modalPauseIcon = document.getElementById("modal-pause-icon");
  if (modalPlayIcon) modalPlayIcon.hidden = playing;
  if (modalPauseIcon) modalPauseIcon.hidden = !playing;
}


// ============================================================
// NOW PLAYING API
// ============================================================

async function fetchNowPlaying() {
  const res = await fetch("/api/now-playing");
  if (!res.ok) throw new Error("Failed to fetch now-playing");
  return res.json();
}


// ============================================================
// GLOBAL RADIO SYNC
// ============================================================

async function syncToNowPlaying() {
  if (!ytReady || localMode) return;

  try {
    const data = await fetchNowPlaying();
    currentTrack = data;

    const index = playlist.findIndex(track => track.id === data.id);
    if (index !== -1) currentIndex = index;

    if (data.id !== currentTrackId) {
      currentTrackId = data.id;
      updateNowPlayingUI(data);

      ytPlayer.cueVideoById({
        videoId: data.id,
        startSeconds: data.offset || 0
      });

      if (isPlaying) {
        ytPlayer.playVideo();
      }
    } else {
      const localPos = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
      if (Math.abs(localPos - (data.offset || 0)) > 2.5) {
        ytPlayer.seekTo(data.offset || 0, true);
      }
    }
  } catch (error) {
    console.error("Radio sync failed:", error);
  }
}


// ============================================================
// UPDATE PLAYER INFORMATION (DOCK & EXPANDED MODAL)
// ============================================================

function updateNowPlayingUI(data) {
  const coverUrl = `https://img.youtube.com/vi/${data.id}/hqdefault.jpg`;

  // Dock Player
  const titleText = document.getElementById("title-text");
  const artistText = document.getElementById("artist-text");
  const coverImg = document.getElementById("cover-img");
  const timeTotal = document.getElementById("time-total");

  if (titleText) titleText.textContent = data.title;
  if (artistText) artistText.textContent = data.artist;
  if (coverImg) coverImg.src = coverUrl;
  if (timeTotal) timeTotal.textContent = fmtTime(data.duration);

  // Modal Player
  const modalTitle = document.getElementById("modal-title-text");
  const modalArtist = document.getElementById("modal-artist-text");
  const modalCover = document.getElementById("modal-cover-img");
  const modalTotal = document.getElementById("modal-time-total");

  if (modalTitle) modalTitle.textContent = data.title;
  if (modalArtist) modalArtist.textContent = data.artist;
  if (modalCover) modalCover.src = coverUrl;
  if (modalTotal) modalTotal.textContent = fmtTime(data.duration);

  // Re-render playlist active state if drawer is open
  if (playlist.length > 0) {
    renderPlaylistTracks(playlist);
  }
}


// ============================================================
// PLAY A TRACK LOCALLY
// ============================================================

function playTrack(index) {
  if (!ytReady || playlist.length === 0) return;

  if (index < 0) index = playlist.length - 1;
  if (index >= playlist.length) index = 0;

  const track = playlist[index];
  currentIndex = index;
  currentTrack = track;
  currentTrackId = track.id;

  // Local Mode activated
  localMode = true;

  const liveBtn = document.getElementById("live-btn");
  if (liveBtn) liveBtn.classList.remove("active");

  updateNowPlayingUI({
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: track.duration
  });

  ytPlayer.loadVideoById({
    videoId: track.id,
    startSeconds: 0
  });

  ytPlayer.unMute();
  ytPlayer.playVideo();

  console.log(`Playing [${index + 1}/${playlist.length}] ${track.title}`);
}

function playNextTrack() {
  if (currentIndex === -1) {
    currentIndex = playlist.findIndex(track => track.id === currentTrackId);
    if (currentIndex === -1) currentIndex = 0;
  }
  playTrack(currentIndex + 1);
}

function playPreviousTrack() {
  if (currentIndex === -1) {
    currentIndex = playlist.findIndex(track => track.id === currentTrackId);
    if (currentIndex === -1) currentIndex = 0;
  }
  playTrack(currentIndex - 1);
}


// ============================================================
// CONTROLS EVENT LISTENERS
// ============================================================

// Next / Prev Buttons
["next-btn", "modal-next-btn"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", playNextTrack);
});

["prev-btn", "modal-prev-btn"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", playPreviousTrack);
});

// Play / Pause Buttons
["play-btn", "modal-play-btn"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => {
    if (!ytReady) return;

    if (isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.unMute();
      ytPlayer.playVideo();
    }
  });
});

// Return to LIVE Radio Button
const liveBtn = document.getElementById("live-btn");
if (liveBtn) {
  liveBtn.addEventListener("click", async () => {
    localMode = false;
    liveBtn.classList.add("active");
    await syncToNowPlaying();
    if (ytReady) {
      ytPlayer.unMute();
      ytPlayer.playVideo();
    }
  });
}

const drawerLiveBtn = document.getElementById("drawer-live-sync-btn");
if (drawerLiveBtn) {
  drawerLiveBtn.addEventListener("click", async () => {
    localMode = false;
    if (liveBtn) liveBtn.classList.add("active");
    await syncToNowPlaying();
    if (ytReady) {
      ytPlayer.unMute();
      ytPlayer.playVideo();
    }
    closeDrawer();
  });
}


// ============================================================
// SEEK BAR CLICK & PROGRESS TICK
// ============================================================

function setupSeek(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.addEventListener("click", (e) => {
    if (!ytReady || !currentTrack) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * (currentTrack.duration || 1);
    ytPlayer.seekTo(seekTime, true);
  });
}
setupSeek("progress-clickable");
setupSeek("modal-progress-clickable");

function tickProgress() {
  if (ytReady && ytPlayer.getCurrentTime && currentTrack) {
    const pos = ytPlayer.getCurrentTime();
    const dur = currentTrack.duration || 1;
    const pct = Math.min(100, (pos / dur) * 100);

    // Dock
    const elapsedEl = document.getElementById("time-elapsed");
    const fillEl = document.getElementById("progress-fill");
    if (elapsedEl) elapsedEl.textContent = fmtTime(pos);
    if (fillEl) fillEl.style.width = `${pct}%`;

    // Modal
    const modalElapsed = document.getElementById("modal-time-elapsed");
    const modalFill = document.getElementById("modal-progress-fill");
    if (modalElapsed) modalElapsed.textContent = fmtTime(pos);
    if (modalFill) modalFill.style.width = `${pct}%`;
  }
  requestAnimationFrame(tickProgress);
}
requestAnimationFrame(tickProgress);


// ============================================================
// VOLUME CONTROL
// ============================================================

const volumeSlider = document.getElementById("volume-slider");
const modalVolumeSlider = document.getElementById("modal-volume-slider");
const volumeBtn = document.getElementById("volume-btn");

function updateVolume(val) {
  currentVolume = val;
  if (ytReady && ytPlayer.setVolume) {
    ytPlayer.setVolume(val);
  }
  if (volumeSlider) volumeSlider.value = val;
  if (modalVolumeSlider) modalVolumeSlider.value = val;

  const volIcon = document.getElementById("vol-icon");
  const volMuteIcon = document.getElementById("vol-mute-icon");

  if (val === "0" || val === 0) {
    if (volIcon) volIcon.hidden = true;
    if (volMuteIcon) volMuteIcon.hidden = false;
  } else {
    if (volIcon) volIcon.hidden = false;
    if (volMuteIcon) volMuteIcon.hidden = true;
  }
}

if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => updateVolume(e.target.value));
}
if (modalVolumeSlider) {
  modalVolumeSlider.addEventListener("input", (e) => updateVolume(e.target.value));
}

if (volumeBtn) {
  volumeBtn.addEventListener("click", () => {
    if (isMuted) {
      isMuted = false;
      if (ytReady && ytPlayer.unMute) ytPlayer.unMute();
      updateVolume(currentVolume || 100);
    } else {
      isMuted = true;
      if (ytReady && ytPlayer.mute) ytPlayer.mute();
      const volIcon = document.getElementById("vol-icon");
      const volMuteIcon = document.getElementById("vol-mute-icon");
      if (volIcon) volIcon.hidden = true;
      if (volMuteIcon) volMuteIcon.hidden = false;
    }
  });
}


// ============================================================
// EXPANDED MODAL PLAYER TOGGLE
// ============================================================

const fullPlayerModal = document.getElementById("full-player-modal");
const dockCoverBtn = document.getElementById("dock-cover-btn");
const modalCloseBg = document.getElementById("modal-close-bg");
const modalCloseBtn = document.getElementById("modal-close-btn");

function openModal() {
  if (fullPlayerModal) {
    fullPlayerModal.classList.add("active");
    fullPlayerModal.setAttribute("aria-hidden", "false");
  }
}

function closeModal() {
  if (fullPlayerModal) {
    fullPlayerModal.classList.remove("active");
    fullPlayerModal.setAttribute("aria-hidden", "true");
  }
}

if (dockCoverBtn) dockCoverBtn.addEventListener("click", openModal);
if (modalCloseBg) modalCloseBg.addEventListener("click", closeModal);
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);


// ============================================================
// PLAYLIST DRAWER TOGGLE
// ============================================================

const playlistDrawer = document.getElementById("playlist-drawer");
const queueBtn = document.getElementById("queue-btn");
const dockQueueBtn = document.getElementById("dock-queue-btn");
const drawerOverlay = document.getElementById("drawer-overlay");
const drawerCloseBtn = document.getElementById("drawer-close-btn");

function openDrawer() {
  if (playlistDrawer) {
    playlistDrawer.classList.add("active");
    playlistDrawer.setAttribute("aria-hidden", "false");
  }
}

function closeDrawer() {
  if (playlistDrawer) {
    playlistDrawer.classList.remove("active");
    playlistDrawer.setAttribute("aria-hidden", "true");
  }
}

if (queueBtn) queueBtn.addEventListener("click", openDrawer);
if (dockQueueBtn) dockQueueBtn.addEventListener("click", openDrawer);
if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);
if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeDrawer);


// ============================================================
// ATMOSPHERE THEME SWITCHER
// ============================================================

const themeBtn = document.getElementById("theme-btn");
const bgImg = document.getElementById("bg-img");

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    currentWallpaperIdx = (currentWallpaperIdx + 1) % WALLPAPERS.length;
    if (bgImg) {
      bgImg.style.opacity = 0;
      setTimeout(() => {
        bgImg.src = WALLPAPERS[currentWallpaperIdx];
        bgImg.style.opacity = 1;
      }, 300);
    }
  });
}


// ============================================================
// KERALA BUS AIR HORN SYNTHESIZER (WEB AUDIO API)
// ============================================================

const hornAudio = new Audio("assets/Horn.mp3");

function playKeralaBusHorn() {
  try {
    hornAudio.currentTime = 0;
    hornAudio.play();
  } catch (e) {
    console.error("Air horn SFX error:", e);
  }
}

["horn-btn", "modal-horn-btn"].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener("click", () => {
      playKeralaBusHorn();
      btn.style.transform = "scale(0.92)";
      setTimeout(() => { btn.style.transform = ""; }, 150);
    });
  }
});


// ============================================================
// ONLINE COUNTER HEARTBEAT
// ============================================================

async function heartbeat() {
  try {
    const res = await fetch("/api/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    const onlineEl = document.getElementById("online-count");
    if (onlineEl) onlineEl.textContent = data.count;
  } catch (e) {
    // Fail silently
  }
}
heartbeat();
setInterval(heartbeat, 15000);


// ============================================================
// PERIODIC RADIO SYNC (EVERY 6 SECONDS)
// ============================================================

setInterval(() => {
  if (!localMode) {
    syncToNowPlaying();
  }
}, 6000);


// ============================================================
// INIT
// ============================================================

loadPlaylist();
