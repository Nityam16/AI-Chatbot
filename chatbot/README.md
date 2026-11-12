# AI Chatbot with Knowledge Base (React + Node/Express + LLM API)

A chat app where a React frontend talks to an Express backend, which calls an LLM API
(Gemini or Anthropic). The backend adds a simple retrieval step: it searches your own
`.txt` documents in `server/knowledge/` and gives the most relevant passages to the model
as context, so answers can come from your documents.

## Run locally
1. Server:
   cd server && npm install
   copy .env.example to .env and add your API key (set LLM_PROVIDER and the model name)
   npm run dev
2. Client (new terminal):
   cd client && npm install && npm run dev
3. Open http://localhost:5173

## How it works
- POST /api/chat validates the conversation, retrieves relevant chunks (keyword scoring
  weighted by rarity), adds them to the system prompt, and calls the LLM.
- The API key stays on the server and is never sent to the browser.
- Retrieval is keyword-based. Upgrading to embeddings plus a vector database is a next step.

## Deploy
- Server on Render: set the env vars from .env.example and CLIENT_ORIGIN to your frontend URL.
- Client on Vercel: set VITE_API_URL to your Render server URL.
