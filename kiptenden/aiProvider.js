"use strict";

const DEFAULT_POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "openai";
const AI_API_BASE_URL = String(
    process.env.AI_API_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_PROVIDER = String(process.env.AI_PROVIDER || "auto").toLowerCase();
const AI_REASONING_EFFORT = process.env.AI_REASONING_EFFORT || "";
const AI_REASONING_PARAM = process.env.AI_REASONING_PARAM || "reasoning";
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || "";
const ALLOW_POLLINATIONS_FALLBACK = String(process.env.ALLOW_POLLINATIONS_FALLBACK || "false").toLowerCase() === "true";

const KIPTENDEN_YOUTHS_SYSTEM_PROMPT = [
    "You are the Kiptenden Youths AI assistant for WhatsApp.",
    "Be helpful, friendly, concise, and conversational.",
    "Support young people with learning, digital skills, community activities,",
    "career guidance, entrepreneurship, and everyday questions.",
    "Do not claim to be ChatGPT, Gemini, Claude, or another branded assistant.",
    "If asked who created you, say you were created and are operated by Kiptenden Youths.",
    "Do not invent official Kiptenden Youths phone numbers, addresses, dates, or programs.",
].join(" ");

function createTimeoutSignal(timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, timer };
}

async function readResponseBody(response) {
    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch (_) {
        data = null;
    }
    return { raw, data };
}

async function queryOpenAICompatible(prompt, options = {}) {
    if (!AI_API_KEY) {
        throw new Error("AI_API_KEY is not configured");
    }

    const timeout = createTimeoutSignal(Number(options.timeoutMs) || 45000);
    const requestBody = {
        model: options.model || AI_MODEL,
        temperature: Number.isFinite(options.temperature) ? options.temperature : 0.7,
        max_tokens: Number(options.maxTokens) || 1200,
        messages: [
            {
                role: "system",
                content: options.systemPrompt || KIPTENDEN_YOUTHS_SYSTEM_PROMPT,
            },
            { role: "user", content: String(prompt).slice(0, 12000) },
        ],
    };
    const reasoningEffort = options.reasoningEffort || AI_REASONING_EFFORT;
    if (reasoningEffort) {
        if (AI_REASONING_PARAM === "reasoning_effort") {
            requestBody.reasoning_effort = reasoningEffort;
        } else {
            requestBody.reasoning = { effort: reasoningEffort };
        }
    }

    try {
        const response = await fetch(`${AI_API_BASE_URL}/chat/completions`, {
            method: "POST",
            signal: timeout.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
        });

        const { raw, data } = await readResponseBody(response);
        if (!response.ok) {
            const detail = data?.error?.message || raw.slice(0, 300) || `HTTP ${response.status}`;
            throw new Error(`AI provider ${response.status}: ${detail}`);
        }

        const content = data?.choices?.[0]?.message?.content || data?.output_text;
        if (!content) throw new Error("AI provider returned an empty response");
        return String(content).trim();
    } finally {
        clearTimeout(timeout.timer);
    }
}

async function queryPollinations(prompt, model = DEFAULT_POLLINATIONS_MODEL) {
    const wrappedPrompt = `${KIPTENDEN_YOUTHS_SYSTEM_PROMPT}\n\nUser: ${String(prompt).slice(0, 12000)}\nAssistant:`;
    const pollinationsKey = POLLINATIONS_API_KEY ? `&key=${encodeURIComponent(POLLINATIONS_API_KEY)}` : "";
    const url = `https://text.pollinations.ai/${encodeURIComponent(wrappedPrompt)}?model=${encodeURIComponent(model)}&seed=${Math.floor(Math.random() * 999999)}&json=false${pollinationsKey}`;
    const timeout = createTimeoutSignal(60000);

    try {
        const response = await fetch(url, {
            method: "GET",
            signal: timeout.signal,
            headers: { Accept: "text/plain" },
        });
        const { raw, data } = await readResponseBody(response);
        if (!response.ok) {
            const detail = data?.error || raw.slice(0, 300) || `HTTP ${response.status}`;
            throw new Error(`Pollinations ${response.status}: ${detail}`);
        }
        const text = String(raw || "").trim();
        if (!text || (data && data.error)) throw new Error("Pollinations returned an empty response");
        return text;
    } finally {
        clearTimeout(timeout.timer);
    }
}

async function queryAI(prompt, options = {}) {
    const provider = String(options.provider || AI_PROVIDER).toLowerCase();
    const model = options.model || AI_MODEL;

    if (provider === "pollinations") {
        return queryPollinations(prompt, options.pollinationsModel || DEFAULT_POLLINATIONS_MODEL);
    }

    if (provider === "openai") {
        return queryOpenAICompatible(prompt, { ...options, model });
    }

    if (AI_API_KEY) {
        try {
            return await queryOpenAICompatible(prompt, { ...options, model });
        } catch (error) {
            if (!ALLOW_POLLINATIONS_FALLBACK) throw error;
            console.warn(`[AI] OpenAI-compatible provider failed; using explicitly enabled Pollinations fallback: ${error.message}`);
            return queryPollinations(prompt, options.pollinationsModel || DEFAULT_POLLINATIONS_MODEL);
        }
    }

    if (ALLOW_POLLINATIONS_FALLBACK) {
        return queryPollinations(prompt, options.pollinationsModel || DEFAULT_POLLINATIONS_MODEL);
    }

    throw new Error("AI_API_KEY is not configured. Set AI_API_KEY and AI_MODEL, or explicitly enable a configured Pollinations provider.");
}

module.exports = {
    AI_API_BASE_URL,
    AI_MODEL,
    AI_PROVIDER,
    KIPTENDEN_YOUTHS_SYSTEM_PROMPT,
    queryAI,
    queryOpenAICompatible,
    queryPollinations,
};
