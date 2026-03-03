# TD Direct Investing — AI Account Opening Assistant

A locally-hosted AI chatbot that helps customers through TD Direct Investing's account opening process. Powered by MiniMax M2.5 (via Ollama) with optional secure public access via ngrok.

## Security

External users can only access the chat interface — nothing else on your machine is exposed.

| Layer | Protection |
|-------|-----------|
| **ngrok** | Only exposes port 3000; no SSH, filesystem, or other services |
| **ngrok auth** | Optional password protection at startup |
| **Route whitelist** | Only `/` and `/api/chat` are accessible; everything else returns 404 |
| **Rate limiting** | 30 requests per minute per IP |
| **Body size limit** | Max 50KB per request |
| **Input truncation** | Messages capped at 5,000 chars; system prompt at 20,000 |
| **Request timeout** | 60-second timeout per request |
| **CSP headers** | Browser restricted to approved resource origins |
| **No file access** | No directory listing; dotfiles (`.env`, `.git`) are blocked |

## Prerequisites

```bash
brew install ollama ngrok node

# Sign up at https://ngrok.com (free), then add your auth token:
ngrok config add-authtoken YOUR_TOKEN
```

## Usage

```bash
cd td-onboarding-mac-v3
./start.sh
```

On startup you'll be prompted to choose a security level:

```
🔒 Security options for public URL:

  1) Open access (anyone with link can use)
  2) Password protected (recommended)
  3) Local only (no public URL)
```

If you choose option 2, a random password is generated:

```
🚀 READY!
  Public:   https://a1b2-xxx.ngrok-free.app
  User: demo / Pass: 8f3a2b1c

  📋 Send the link and credentials to your tester
```

## Edge Cases

Business rules and special-case responses are defined in `edge-cases.txt`. The server hot-reloads this file — edit it while running and changes apply immediately, no restart needed.

## Shutdown

Press `Ctrl+C` — the server and ngrok tunnel stop automatically, and the public link is invalidated.
