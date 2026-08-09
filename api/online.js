// Uses Upstash Redis (free tier) so the online count is real and shared
// across all serverless instances. Set these two env vars in Vercel:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Without them, this falls back to an in-memory counter that only works
// reliably for local `vercel dev` testing (each cold start resets it).

const WINDOW_MS = 30000; // a client counts as "online" if it pinged in the last 30s

const memoryStore = new Map();

async function upstash(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(`${url}/${command.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
  return res.json();
}

async function countOnlineRedis(clientId) {
  const now = Date.now();

  if (clientId) {
    await upstash(["zadd", "online_users", now.toString(), clientId]);
  }
  // drop anything older than the window
  await upstash(["zremrangebyscore", "online_users", "0", (now - WINDOW_MS).toString()]);
  const result = await upstash(["zcard", "online_users"]);
  return result.result;
}

function countOnlineMemory(clientId) {
  const now = Date.now();
  if (clientId) memoryStore.set(clientId, now);
  for (const [id, ts] of memoryStore) {
    if (now - ts > WINDOW_MS) memoryStore.delete(id);
  }
  return memoryStore.size;
}

module.exports = async (req, res) => {
  const clientId = req.method === "POST" ? (req.body && req.body.clientId) : null;
  const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  try {
    const count = useRedis ? await countOnlineRedis(clientId) : countOnlineMemory(clientId);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count: Math.max(count, 1) });
  } catch (e) {
    res.status(200).json({ count: countOnlineMemory(clientId) });
  }
};
