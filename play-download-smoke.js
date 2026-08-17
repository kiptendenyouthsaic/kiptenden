"use strict";

const fs = require("fs");
const {
    downloadAudioWithYtDlp,
    cleanupAudioDownload,
    targetForQuery,
} = require("./kiptenden/musicDownloader");

(async () => {
    if (targetForQuery("Adele Hello", false) !== "ytsearch1:Adele Hello") {
        throw new Error("search queries must use ytsearch1 target syntax");
    }

    let download;
    try {
        download = await downloadAudioWithYtDlp("Adele Hello", {
            isUrl: false,
            maxBytes: 25 * 1024 * 1024,
        });
        if (!download.localPath || !/\.mp3$/i.test(download.localPath)) {
            throw new Error("yt-dlp did not produce an MP3 path");
        }
        const stat = fs.statSync(download.localPath);
        if (!stat.isFile() || stat.size <= 0) {
            throw new Error("downloaded MP3 is missing or empty");
        }
        console.log(`PLAY DOWNLOAD SMOKE PASS: ${download.title} (${stat.size} bytes)`);
    } finally {
        await cleanupAudioDownload(download);
    }
})()
    .catch((error) => {
        console.error("PLAY DOWNLOAD SMOKE FAIL:", error.message);
        process.exitCode = 1;
    })
    .finally(() => {
        setTimeout(() => process.exit(process.exitCode || 0), 50);
    });

module.exports = {};

