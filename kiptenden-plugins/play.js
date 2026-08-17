"use strict";

const { gmd } = require("../kiptenden");
const axios = require("axios");
const {
    downloadAudioWithYtDlp,
    cleanupAudioDownload,
    DEFAULT_MAX_BYTES,
} = require("../kiptenden/musicDownloader");

// ─── helpers ──────────────────────────────────────────────────────────────────

function isYtUrl(str) {
    return /(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([A-Za-z0-9_-]{11})/.test(str);
}

function extractYtId(url) {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

function fmtDuration(secs) {
    const s = parseInt(secs) || 0;
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
}

// ── Kiptenden Youths box formatter ───────────────────────────────────────────
const fmt = (title, lines, footer) =>
    `╭─❏ 「 ${title}」\n${lines.map(l => `│ ${l}`).join("\n")}\n╰───────────────\n> _${footer}_`;

// ── Video API chain ───────────────────────────────────────────────────────────
async function resolveVideo(query, isUrl) {
    const enc = encodeURIComponent(query);
    const id  = isUrl ? extractYtId(query) : null;

    const toxicChain = [
        // Nexray ytmp4
        async () => {
            const fullUrl = id
                ? `https://youtube.com/watch?v=${id}`
                : `https://youtube.com/results?search_query=${enc}`;
            const r = await axios.get(
                `https://api.nexray.web.id/downloader/ytmp4?url=${encodeURIComponent(isUrl ? fullUrl : query)}&resolusi=720`,
                { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 90000 }
            );
            if (!r.data?.status || !r.data?.result?.url) throw new Error("nexray mp4 fail");
            return {
                url: r.data.result.url,
                title: r.data.result.title || "Video",
                duration: r.data.result.duration || 0,
            };
        },
        // sidycoders mp4
        async () => {
            const r = await axios.get(
                `https://api.sidycoders.xyz/api/ytdl?url=${enc}&format=mp4&apikey=memberdycoders`,
                { timeout: 60000 }
            );
            if (!r.data?.status || !r.data?.cdn) throw new Error("sidycoders mp4 fail");
            return { url: r.data.cdn, title: r.data.title || "Video" };
        },
    ];

    const legacyChain = [
        `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${enc}`,
        `https://api.siputzx.my.id/api/d/ytmp4?url=${enc}`,
        `https://apiskeith.top/download/video?url=${enc}`,
    ].map(endpoint => async () => {
        const { data } = await axios.get(endpoint, { timeout: 60000 });
        const url = data?.result || data?.download_url || data?.result?.url ||
                    data?.result?.download_url || data?.url || data?.link ||
                    (data?.status === true && typeof data?.result === "string" ? data.result : null);
        if (!url || typeof url !== "string" || !url.startsWith("http")) throw new Error("no url");
        return { url, title: data?.title || data?.result?.title || "Video" };
    });

    for (const fn of [...toxicChain, ...legacyChain]) {
        try { return await fn(); } catch {}
    }
    return null;
}

// ─── PLAY (audio) ─────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "play",
        aliases: ["music", "song", "yta", "audio", "ply"],
        category: "downloader",
        react: "🎶",
        description: "Download and send audio from YouTube. Usage: .play <song name or URL>",
    },
    async (from, Kiptenden, conText) => {
        const { q, reply, react, mek, botFooter, botName } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply(
                fmt("PLAY", [
                    "Give me a song name or YouTube link.",
                    "Example: .play harlem shake",
                    "Or: .play https://youtu.be/dQw4w9WgXcQ",
                ], botFooter)
            );
        }

        const query = q.trim();
        const ytUrl = isYtUrl(query);
        const configuredMaxMb = Number(process.env.PLAY_MAX_MB || 25);
        const maxBytes = Number.isFinite(configuredMaxMb) && configuredMaxMb > 0
            ? configuredMaxMb * 1024 * 1024
            : DEFAULT_MAX_BYTES;

        await react("⌛");
        await reply(fmt("PLAY", ["Searching and downloading... please wait."], botFooter));

        let resolved;
        try {
            resolved = await downloadAudioWithYtDlp(query, {
                isUrl: ytUrl,
                maxBytes,
            });
        } catch (err) {
            await react("❌");
            return reply(fmt("PLAY", [
                "Download failed.",
                err.message || "yt-dlp could not retrieve this song.",
                "Try another title or a direct YouTube link.",
            ], botFooter));
        }

        const { localPath, title, tempDir } = resolved;
        const safeTitle = (title || query).replace(/[^\w\s.-]/g, "").trim() || "kiptenden-audio";

        try {
            await Kiptenden.sendMessage(
                from,
                {
                    audio: { url: localPath },
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${safeTitle}.mp3`,
                },
                { quoted: mek }
            );
            await react("✅");
        } catch (err) {
            await react("❌");
            return reply(fmt("PLAY", [`Sending audio failed: ${err.message}`], botFooter));
        } finally {
            await cleanupAudioDownload({ tempDir, localPath });
        }
    }
);

// ─── YTMP3 (direct YouTube link) ─────────────────────────────────────────────

gmd(
    {
        pattern: "ytmp3",
        aliases: ["ymp3", "yt3", "ytaudio"],
        category: "downloader",
        react: "🎵",
        description: "Download audio from a YouTube URL. Usage: .ytmp3 <YouTube URL>",
    },
    async (from, Kiptenden, conText) => {
        const { q, reply, react, mek, botFooter } = conText;

        if (!q || !isYtUrl(q.trim())) {
            await react("❌");
            return reply(
                fmt("YTMP3", [
                    "Provide a valid YouTube URL.",
                    "Example: .ytmp3 https://youtu.be/xxxx",
                ], botFooter)
            );
        }

        await react("⌛");
        let resolved;
        try {
            resolved = await downloadAudioWithYtDlp(q.trim(), {
                isUrl: true,
                maxBytes: DEFAULT_MAX_BYTES,
            });
        } catch (err) {
            await react("❌");
            return reply(fmt("YTMP3", [
                "Download failed.",
                err.message || "yt-dlp could not retrieve this URL.",
            ], botFooter));
        }

        try {
            const safeTitle = (resolved.title || "audio").replace(/[^\w\s.-]/g, "").trim() || "kiptenden-audio";
            await Kiptenden.sendMessage(
                from,
                {
                    audio: { url: resolved.localPath },
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${safeTitle}.mp3`,
                },
                { quoted: mek }
            );

            await reply(fmt("YouTube MP3", [
                `🎵 ${resolved.title || "Track"}`,
            ], botFooter));

            await react("✅");
        } catch (err) {
            await react("❌");
            return reply(fmt("YTMP3", [`Failed: ${err.message}`], botFooter));
        } finally {
            await cleanupAudioDownload(resolved);
        }
    }
);

// ─── VIDEO ────────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "video",
        aliases: ["ytmp4", "mp4", "dlmp4", "ytv", "ytvideo"],
        category: "downloader",
        react: "🎥",
        description: "Download and send video from YouTube. Usage: .video <title or URL>",
    },
    async (from, Kiptenden, conText) => {
        const { q, reply, react, mek, botFooter } = conText;

        if (!q || !q.trim()) {
            await react("❌");
            return reply(
                fmt("YTMP4", [
                    "Give me a YouTube URL or video title.",
                    "Example: .video Blinding Lights",
                    "Or: .video https://youtu.be/fHI8X4OXluQ [720]",
                ], botFooter)
            );
        }

        const parts  = q.trim().split(/\s+/);
        const query  = parts[0];
        const ytUrl  = isYtUrl(query);

        await react("⌛");
        await reply(fmt("YTMP4", ["Processing... This may take up to 60s."], botFooter));

        const resolved = await resolveVideo(query, ytUrl);

        if (!resolved) {
            await react("❌");
            return reply(
                fmt("YTMP4", [
                    "Download failed.",
                    "Video might be age-restricted, unavailable, or too large.",
                ], botFooter)
            );
        }

        const { url, title, duration } = resolved;

        try {
            await Kiptenden.sendMessage(
                from,
                {
                    video: { url },
                    mimetype: "video/mp4",
                    caption: fmt("YouTube MP4", [
                        `🎬 ${title || query}`,
                        duration ? `⏱ ${fmtDuration(duration)}` : null,
                        "📺 Quality: 720p",
                    ].filter(Boolean), botFooter),
                },
                { quoted: mek }
            );
            await react("✅");
        } catch (err) {
            await react("❌");
            return reply(fmt("YTMP4", [`Download failed: ${err.message}`], botFooter));
        }
    }
);
