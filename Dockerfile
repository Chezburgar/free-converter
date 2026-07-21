# Free Converter — full app image (Node + ffmpeg + yt-dlp)
FROM node:20-slim

# ffmpeg (conversion engine) + curl/unzip/ca-certs for fetching tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp: standalone Linux binary (self-contained, no python needed), kept fresh
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Deno: JS runtime yt-dlp needs for YouTube signature extraction
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
      -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /usr/local/bin \
    && rm /tmp/deno.zip \
    && chmod a+rx /usr/local/bin/deno

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
