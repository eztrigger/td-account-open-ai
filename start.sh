#!/bin/bash
# ═══════════════════════════════════════════════════
# TD Onboarding Assistant — Secure Mac startup
# ═══════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  TD Direct Investing — AI Account Opening    ║"
echo "  ║  MiniMax M2.5 Cloud · Secure Mode            ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ─── Check Ollama ────────────────────────────────
if ! command -v ollama &> /dev/null; then
  echo -e "${RED}❌ Ollama not found.${NC}"
  echo "   Install: brew install ollama"
  exit 1
fi
echo -e "${GREEN}✅ Ollama installed${NC}"

# ─── Start Ollama if not running ─────────────────
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo -e "${YELLOW}⏳ Starting Ollama...${NC}"
  ollama serve &> /dev/null &
  sleep 2
fi
echo -e "${GREEN}✅ Ollama running${NC}"

# ─── Pull model ──────────────────────────────────
MODEL="minimax-m2.5:cloud"
echo -e "${YELLOW}⏳ Ensuring ${MODEL} is available...${NC}"
ollama pull $MODEL 2>/dev/null || true
echo -e "${GREEN}✅ Model ready${NC}"

# ─── Check Node.js ───────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found. Install: brew install node${NC}"
  exit 1
fi

# ─── Install deps ────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}⏳ Installing dependencies...${NC}"
  npm install --silent
fi
echo -e "${GREEN}✅ Dependencies ready${NC}"

# ─── Check ngrok ─────────────────────────────────
if ! command -v ngrok &> /dev/null; then
  echo ""
  echo -e "${YELLOW}⚠️  ngrok not found. Install for public access:${NC}"
  echo "   brew install ngrok"
  echo "   ngrok config add-authtoken YOUR_TOKEN"
  echo ""
  echo -e "${BOLD}Starting local-only: http://localhost:3000${NC}"
  node server.js
  exit 0
fi

# ─── Start Node server ──────────────────────────
node server.js &
SERVER_PID=$!
sleep 2

# ─── Start ngrok ─────────────────────────────────
echo ""
echo -e "${CYAN}🔒 Security options for public URL:${NC}"
echo ""
echo "  1) Open access (anyone with link can use)"
echo "  2) Password protected (recommended)"
echo "  3) Local only (no public URL)"
echo ""
read -p "  Choose [1/2/3, default=2]: " CHOICE
CHOICE=${CHOICE:-2}

case $CHOICE in
  1)
    echo -e "${YELLOW}⏳ Creating public URL (open access)...${NC}"
    ngrok http 3000 --log=stdout > /tmp/ngrok.log 2>&1 &
    ;;
  2)
    # Generate a random password
    PASS=$(openssl rand -hex 4)
    echo -e "${YELLOW}⏳ Creating password-protected public URL...${NC}"
    ngrok http 3000 --basic-auth="demo:${PASS}" --log=stdout > /tmp/ngrok.log 2>&1 &
    ;;
  3)
    echo ""
    echo -e "${GREEN}🚀 Running locally: http://localhost:3000${NC}"
    echo "   Press Ctrl+C to stop."
    wait $SERVER_PID
    exit 0
    ;;
  *)
    echo "Invalid choice"
    kill $SERVER_PID 2>/dev/null
    exit 1
    ;;
esac

NGROK_PID=$!
sleep 3

# ─── Get public URL ──────────────────────────────
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
  | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PUBLIC_URL" ]; then
  echo -e "${YELLOW}⚠️  Cannot get ngrok URL. Check http://localhost:4040${NC}"
  PUBLIC_URL="(pending...)"
fi

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo -e "  ║  ${GREEN}🚀 READY!${NC}                                              ║"
echo "  ╠══════════════════════════════════════════════════════════╣"
echo -e "  ║  Local:    ${BOLD}http://localhost:3000${NC}                        ║"
echo -e "  ║  Public:   ${BOLD}${PUBLIC_URL}${NC}"

if [ "$CHOICE" = "2" ]; then
  echo "  ║                                                          ║"
  echo -e "  ║  Username: ${BOLD}demo${NC}                                          ║"
  echo -e "  ║  Password: ${BOLD}${PASS}${NC}                                      ║"
  echo "  ║                                                          ║"
  echo "  ║  📋 Send this to your tester:                             ║"
  echo -e "  ║  ${CYAN}${PUBLIC_URL}${NC}"
  echo -e "  ║  ${CYAN}User: demo / Pass: ${PASS}${NC}"
fi

echo "  ║                                                          ║"
echo "  ║  🔒 Security: rate limit 30req/min, body 50KB            ║"
echo "  ║  Press Ctrl+C to stop everything.                        ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Cleanup on exit ─────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID 2>/dev/null
  kill $NGROK_PID 2>/dev/null
  echo -e "${GREEN}✅ All stopped. Safe to close.${NC}"
}
trap cleanup EXIT INT TERM

wait $SERVER_PID
