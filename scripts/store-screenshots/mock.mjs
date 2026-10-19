// 极简 OpenAI 兼容端点（SSE）+ 静态演示站点
import http from "node:http"
import fs from "node:fs"
import path from "node:path"

export const EXPLAIN_ANSWER = `Retrieval and timing do two different jobs here, and the point is their combination.

- **Retrieval is what strengthens.** Pulling an answer out of your head rewrites the path back to it; re-reading only re-exposes you to the material, which builds familiarity but not access.
- **Spacing sets the difficulty.** A recall that happens *just* as the memory is fading gains far more than one that is easy, because the effort signals the connection is still needed.

The rule that follows: recall an item at the moment it becomes hard, and widen the gap after each success.`

export const TECH_ANSWER = `One thread means one queue: a synchronous call holds the loop, so every callback waits behind it.

- **Blocking is wall-clock time**, not CPU time. A 200 ms sync read is a 200 ms pause for everyone.
- **More cores do not help.** Worker threads add loops, never shorten a stall on the busy one.`

export const BLOCKING_FOLLOWUP = `Profile first, then guess:

1. **Watch p99, not p50.** A stall disappears in the average.
2. **Sample the stack while it is stalled.** \`--prof\` names the frame.
3. **Grep the hot path** for \`readFileSync\` and large \`JSON.parse\` calls.`

export const FOLLOWUP_ANSWER = `Start with one day, then multiply by roughly 2.5 each time you succeed:

1. **Day 1** — first review, while the material is still fresh.
2. **Day 3, Day 8, Day 20, Day 50** — each interval is set by the previous success.
3. **On a miss** — reset that item back one step instead of pushing it out.

A simple rule of thumb: if a review feels effortless, the interval was too short. If you fail it, the interval was too long.`

function chunkText(text, size = 22) {
  const out = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function sendChunk(res, content) {
  const payload = {
    id: "chatcmpl-demo",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "gpt-4o-mini",
    choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: content ? null : "stop" }]
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export function startServers({ siteDir, port = Number(process.env.PORT ?? 4173) }) {
  const server = http.createServer(async (req, res) => {
    // ---- mock OpenAI 兼容端点 ----
    if (process.env.MOCK_LOG) console.log("[mock]", req.method, req.url)
    if (req.url.startsWith("/v1/chat/completions") && req.method === "POST") {
      let body = ""
      for await (const c of req) body += c
      const parsed = JSON.parse(body || "{}")
      const messages = parsed.messages ?? []
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
      const answer = /blocking call|block it|find the call/i.test(lastUser)
        ? BLOCKING_FOLLOWUP
        : /how long should each interval/i.test(lastUser)
          ? FOLLOWUP_ANSWER
          : /event loop|one thread|sync read|paused loop|CPU cores/i.test(lastUser)
            ? TECH_ANSWER
            : EXPLAIN_ANSWER
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*"
      })
      for (const piece of chunkText(answer)) {
        sendChunk(res, piece)
        await new Promise((r) => setTimeout(r, 14))
      }
      sendChunk(res, "")
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }
    if (req.url.startsWith("/v1/models")) {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" })
      res.end(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }))
      return
    }
    // ---- 静态站点 ----
    const urlPath = decodeURIComponent(req.url.split("?")[0])
    const file = path.join(siteDir, urlPath === "/" ? "a.html" : urlPath)
    if (!file.startsWith(siteDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      res.end("not found")
      return
    }
    const ext = path.extname(file)
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html; charset=utf-8"
    res.writeHead(200, { "content-type": type })
    res.end(fs.readFileSync(file))
  })
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)))
}
