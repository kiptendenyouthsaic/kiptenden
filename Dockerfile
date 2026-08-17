# Kiptenden Youths Bot
# Node 22 matches the package engine requirement.
FROM node:22-bookworm-slim

# Native dependencies are required by better-sqlite3, sharp, and media features.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        make \
        g++ \
        ffmpeg \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# The project requests npm 11.x.
RUN npm install --global npm@11 \
    && npm cache clean --force

# yt-dlp provides the local YouTube search/download path used by .play.
RUN python3 -m pip install --no-cache-dir --break-system-packages yt-dlp

ENV NODE_ENV=production \
    PYTHON=/usr/bin/python3 \
    npm_config_python=/usr/bin/python3 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

WORKDIR /app

# Install dependencies separately so Docker can cache this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the application source after dependencies are installed.
COPY . .

# The bot's pairing/status web server uses port 5000 by default.
EXPOSE 5000

CMD ["npm", "start"]
