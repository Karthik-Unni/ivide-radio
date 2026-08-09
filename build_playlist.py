"""
Builds playlist.json from tracks.txt by searching YouTube for each
"Title <tab> Artist" line and pulling back the video ID + duration.

This only performs a *search* and reads metadata — it does not download
or extract any audio/video.

Usage:
    pip install yt-dlp
    python build_playlist.py
"""

import json
import time
from yt_dlp import YoutubeDL

INPUT_FILE = "tracks.txt"
OUTPUT_FILE = "playlist.json"

ydl_opts = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "default_search": "ytsearch1",
    "noplaylist": True,
    "extract_flat": False,
}


def search_track(query):
    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(query, download=False)
        entry = info["entries"][0]
        return entry["id"], entry.get("duration") or 0, entry.get("title", "")


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    results = []
    failed = []

    for i, line in enumerate(lines, 1):
        if "\t" not in line:
            print(f"[{i}/{len(lines)}] SKIP (bad format): {line}")
            continue
        title, artist = line.split("\t", 1)
        query = f"{title} {artist} song"

        try:
            video_id, duration, yt_title = search_track(query)
            results.append({
                "id": video_id,
                "title": title,
                "artist": artist,
                "duration": duration,
            })
            print(f"[{i}/{len(lines)}] OK  {title} -> {video_id} ({duration}s) | matched: {yt_title}")
        except Exception as e:
            print(f"[{i}/{len(lines)}] FAIL {title} — {e}")
            failed.append(line)

        time.sleep(0.3)  # be polite, avoid hammering

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {len(results)} tracks written to {OUTPUT_FILE}.")
    if failed:
        print(f"{len(failed)} tracks failed — check these manually:")
        for line in failed:
            print(f"  - {line}")


if __name__ == "__main__":
    main()
