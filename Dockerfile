FROM node:22-bookworm-slim AS builder

# Install uv for the agent-server runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 python3-venv ca-certificates \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy OpenHands source
COPY OpenHands/package.json OpenHands/package-lock.json ./
RUN npm ci --ignore-scripts

COPY OpenHands/ ./
RUN npm run build:app

# --- Production stage ---
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git python3 python3-venv ca-certificates tmux \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy built app and node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tools ./tools

# Expose the default port
EXPOSE 8000

# Run in public mode (requires API key)
CMD ["node", "bin/agent-canvas.mjs", "--public"]
