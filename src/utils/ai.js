/**
 * ai.js — minimal, production-safe LLM integration for icebreakers.
 *
 * Design constraints:
 *   - Native fetch (Node 18+) — no new dependencies.
 *   - Hard timeout (AbortController) so a slow model can never hold up a
 *     request; the route falls back to a rule-based opener.
 *   - The prompt only contains STRUCTURED profile fields (never free-form
 *     "about" text), which is the standard defence against prompt injection.
 *   - If OPENROUTER_API_KEY is missing, a rate limit hits, or the model
 *     errors, we return a deterministic fallback icebreaker instead of
 *     failing — the feature must degrade, never break.
 */

const { sharedSkills, formatSkillList } = require("./matchReasons");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_MODEL || "meta-llama/llama-3.3-70b-instruct";
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ICEBREAKER_LENGTH = 240;

/**
 * Deterministic opener that never fails and needs no network. Uses the same
 * explainable signals as the matcher (shared skills, location), so even the
 * fallback feels personal.
 */
const fallbackIcebreaker = (me, other) => {
  const shared = sharedSkills(me, other);
  if (shared.length > 0) {
    const skills = formatSkillList(shared.slice(0, 2));
    return `Hey! I noticed we're both into ${skills} — what's the most interesting thing you've built with it?`;
  }
  const city = (other && other.location && other.location.city) ||
    (me && me.location && me.location.city);
  if (city) {
    return `Hey! I see you're in ${city} — how's the dev scene there?`;
  }
  return "Hey! I'm glad we matched — what are you working on right now?";
};

const describe = (profile) => {
  if (!profile) return [];
  const parts = [];
  if (profile.firstName) parts.push(`First name: ${profile.firstName}`);
  if (Array.isArray(profile.skills) && profile.skills.length) {
    parts.push(`Skills: ${profile.skills.slice(0, 8).join(", ")}`);
  }
  if (profile.location && profile.location.city) {
    parts.push(`City: ${profile.location.city}`);
  }
  if (profile.work && profile.work.role) {
    parts.push(
      `Role: ${profile.work.role}${profile.work.company ? ` at ${profile.work.company}` : ""}`,
    );
  }
  if (profile.github) parts.push(`GitHub username: ${profile.github}`);
  return parts;
};

/**
 * Builds the model prompt from structured fields only. No free-form text
 * (about/bio) is ever included, so there is no vector for prompt injection.
 */
const buildPrompt = (me, other) => [
  "Write one short, friendly opening message for a developer-networking app.",
  "Requirements:",
  "- Under 40 words, natural, specific and lightly playful.",
  "- Base it ONLY on the factual profile details below.",
  "- Do not mention that you are an AI.",
  "- Output ONLY the message text, with no quotes or preamble.",
  "",
  "About me:",
  ...describe(me),
  "",
  "About them:",
  ...describe(other),
].join("\n");

const sanitize = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim();

const callOpenRouter = async (prompt) => {
  if (!API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 80,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[ai] OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const content = data && data.choices && data.choices[0]
      ? data.choices[0].message && data.choices[0].message.content
      : null;
    const text = sanitize(content);
    return text ? text.slice(0, MAX_ICEBREAKER_LENGTH) : null;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error(`[ai] icebreaker timed out after ${REQUEST_TIMEOUT_MS}ms`);
    } else {
      console.error(`[ai] icebreaker call failed: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Generates an icebreaker for a matched pair. Prefers the LLM; degrades to a
 * deterministic fallback on any failure (including a missing API key).
 *
 * @returns {Promise<{ text: string, source: "ai" | "fallback" }>}
 */
const generateIcebreaker = async (me, other) => {
  const aiText = await callOpenRouter(buildPrompt(me, other));
  if (aiText) return { text: aiText, source: "ai" };
  return { text: fallbackIcebreaker(me, other), source: "fallback" };
};

module.exports = {
  MODEL,
  REQUEST_TIMEOUT_MS,
  MAX_ICEBREAKER_LENGTH,
  fallbackIcebreaker,
  buildPrompt,
  sanitize,
  generateIcebreaker,
};
