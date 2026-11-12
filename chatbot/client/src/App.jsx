import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ask me anything. I can also answer from the documents in my knowledge base." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    try {
      // Skip the greeting so the conversation sent to the API starts with a user message.
      const payload = next.filter((_, i) => i > 0).map(({ role, content }) => ({ role, content }));
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMessages([...next, { role: "assistant", content: data.reply, sources: data.sources }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="app">
      <header>
        <h1>AI Chatbot</h1>
        <button className="clear" onClick={() => setMessages(messages.slice(0, 1))}>Clear chat</button>
      </header>

      <main>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.content}</p>
            {m.sources?.length > 0 && <small>Sources: {m.sources.join(", ")}</small>}
          </div>
        ))}
        {loading && <div className="msg assistant typing">Thinking...</div>}
        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </main>

      <footer>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message and press Enter"
          rows={1}
        />
        <button onClick={send} disabled={loading || !input.trim()}>Send</button>
      </footer>
    </div>
  );
}
