import "dotenv/config";
import express from "express";
import cors from "cors";
import { loadKnowledge, retrieve } from "./rag.js";

const app = express();
app.use(cors(process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN } : {}));
app.use(express.json({ limit: "100kb" }));

const PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const chunks = loadKnowledge();
console.log(`Provider: ${PROVIDER} | knowledge chunks loaded: ${chunks.length}`);

const BASE_SYSTEM =
  "You are a friendly, concise assistant. If knowledge base context is provided and relevant, answer from it and say so. " +
  "If a question is clearly about the knowledge base but the context does not contain the answer, say you do not have that information. " +
  "For general questions, answer normally from your own knowledge.";

async function callGemini(messages, system) {
  // Try the main model, then an optional backup model. Retry briefly when Google is busy.
  const models = [process.env.GEMINI_MODEL || "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        }),
        });
      } catch (e) {
        lastErr = new Error(`[${model}] no response within 15s (${e.name})`);
        lastErr.status = 503;
        console.error(lastErr.message);
        break; // a model that does not answer: move on to the backup model instead of waiting again
      }
      const data = await res.json();
      if (res.ok) return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      lastErr = new Error(data?.error?.message || "Gemini request failed");
      lastErr.status = res.status;
      console.error(`[${model}] attempt ${attempt + 1}: ${lastErr.message}`);
      if (![429, 500, 503].includes(res.status)) break; // this model will not work for this key: try the next model
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function callAnthropic(messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Anthropic request failed");
  return data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
}

app.get("/api/health", (_req, res) => res.json({ ok: true, provider: PROVIDER, chunks: chunks.length }));

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: "messages must be a non-empty array" });

  // Validate and trim the conversation (keep the last 20 messages).
  const clean = messages
    .slice(-20)
    .filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user")
    return res.status(400).json({ error: "last message must be from the user" });

  // RAG step: find relevant knowledge chunks for the latest question.
  const hits = retrieve(chunks, clean[clean.length - 1].content);
  const context = hits.length ? "\n\nKnowledge base context:\n" + hits.map((h, i) => `[${i + 1}] (${h.source}) ${h.text}`).join("\n\n") : "";

  try {
    const call = PROVIDER === "anthropic" ? callAnthropic : callGemini;
    const reply = await call(clean, BASE_SYSTEM + context);
    res.json({ reply, sources: [...new Set(hits.map((h) => h.source))] });
  } catch (err) {
    console.error(err.message);
    const busy = [429, 503].includes(err.status);
    res.status(busy ? 503 : 502).json({
      error: busy ? "The AI model is busy right now. Please try again in a minute." : "The AI service failed. Check your API key and model name.",
    });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));