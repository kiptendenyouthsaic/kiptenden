"use strict";

const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function getYtDlpBinary() {
    return process.env.YTDLP_PATH || "yt-dlp";
}

function targetForQuery(query, isUrl) {
    const value = String(query || "").trim();
    return isUrl ? value : `ytsearch1:${value}`;
}

async function prepareYtDlpOptions(tempDir) {
    const args = [];
    const cookiesFile = process.env.YTDLP_COOKIES_FILE;
    const cookiesBase64 = process.env.YTDLP_COOKIES_B64;
    const cookiesText = process.env.YTDLP_COOKIES;

    if (cookiesFile) {
        args.push("--cookies", cookiesFile);
    } else if (cookiesBase64 || cookiesText) {
        const cookiePath = path.join(tempDir, "cookies.txt");
        const contents = cookiesBase64
            ? Buffer.from(cookiesBase64, "base64").toString("utf8")
            : cookiesText;
        await fsp.writeFile(cookiePath, contents, { mode: 0o600 });
        args.push("--cookies", cookiePath);
    }

    if (process.env.YTDLP_PROXY) {
        args.push("--proxy", process.env.YTDLP_PROXY);
    }

    // Node 22 is already present in the Render image and enables yt-dlp's
    // modern YouTube JavaScript challenge support.
    args.push("--js-runtimes", process.env.YTDLP_JS_RUNTIME || "node");
    return args;
}

async function downloadAudioWithYtDlp(query, { isUrl = false, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    const value = String(query || "").trim();
    if (!value) throw new Error("A song name or YouTube URL is required");

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "kiptenden-play-"));
    const outputTemplate = path.join(tempDir, "audio.%(ext)s");
    const targets = isUrl
        ? [value]
        : [targetForQuery(value, false), `scsearch1:${value}`];
    const baseArgs = [
        ...(await prepareYtDlpOptions(tempDir)),
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--quiet",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "5",
        "--max-filesize", `${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))}M`,
        "--print", "after_move:title",
        "--output", outputTemplate,
    ];

    let lastError;
    try {
        for (const target of targets) {
            try {
                const { stdout } = await execFileAsync(getYtDlpBinary(), [...baseArgs, target], {
                    timeout: 120000,
                    maxBuffer: 1024 * 1024,
                    windowsHide: true,
                });
                const files = await fsp.readdir(tempDir);
                const audioName = files.find((name) => /\.mp3$/i.test(name));
                if (!audioName) throw new Error("yt-dlp completed without creating an MP3 file");

                const audioPath = path.join(tempDir, audioName);
                const stat = await fsp.stat(audioPath);
                if (!stat.size) throw new Error("Downloaded MP3 file is empty");
                if (stat.size > maxBytes) throw new Error("Downloaded audio is too large for WhatsApp");

                const title = String(stdout || "")
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .pop() || value;

                return {
                    localPath: audioPath,
                    title,
                    sourceUrl: isUrl ? value : "",
                    size: stat.size,
                    tempDir,
                };
            } catch (error) {
                lastError = error;
                // Remove a partial artifact before trying the next provider.
                await Promise.all((await fsp.readdir(tempDir)).map((name) =>
                    fsp.rm(path.join(tempDir, name), { recursive: true, force: true }).catch(() => {})
                ));
            }
        }

        const detail = lastError?.stderr?.trim() || lastError?.message || "yt-dlp failed";
        throw new Error(detail.slice(-500));
    } catch (error) {
        await cleanupAudioDownload({ tempDir });
        throw error;
    }
}

async function cleanupAudioDownload(download) {
    if (!download) return;
    const tempDir = download.tempDir || (download.localPath && path.dirname(download.localPath));
    if (!tempDir) return;
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

function makeDownloadId() {
    return crypto.randomBytes(6).toString("hex");
}

module.exports = {
    DEFAULT_MAX_BYTES,
    getYtDlpBinary,
    targetForQuery,
    downloadAudioWithYtDlp,
    cleanupAudioDownload,
    makeDownloadId,
    prepareYtDlpOptions,
};

