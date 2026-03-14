import { LANGUAGES } from "./constants.js";
import { SAMPLE_CARD_DEFINITIONS } from "./data.js";

export function normalizeLanguageValue(value, fallback = "ja") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (LANGUAGES.some((lang) => lang.code === text)) return text;
  const byLabel = LANGUAGES.find((lang) => lang.label === text);
  if (byLabel) return byLabel.code;
  return text;
}

export const getLangLabel = (code) => {
  const normalized = normalizeLanguageValue(code, "");
  return LANGUAGES.find((lang) => lang.code === normalized)?.label ?? normalized;
};

export const toLanguageInputValue = (value, fallback = "ja") =>
  getLangLabel(normalizeLanguageValue(value, fallback));

export function getDeckTheme(deck) {
  const h = [deck.name, ...(deck.tags || [])].join(" ");
  if (/IT|computer|CPU|API|tech|code|programming/i.test(h)) {
    return { bg: "linear-gradient(135deg,#0f172a,#1e3a5f)", icon: "IT", accent: "#38bdf8" };
  }
  if (/English|French|Spanish|German|language|TOEIC|TOEFL/i.test(h)) {
    return { bg: "linear-gradient(135deg,#1a1040,#2d1b69)", icon: "EN", accent: "#a78bfa" };
  }
  if (/science|physics|chemistry|biology/i.test(h)) {
    return { bg: "linear-gradient(135deg,#0c1a2e,#1a0e2e)", icon: "SCI", accent: "#818cf8" };
  }
  if (/finance|economics|investment/i.test(h)) {
    return { bg: "linear-gradient(135deg,#064e3b,#065f46)", icon: "FIN", accent: "#34d399" };
  }
  if (/history|philosophy|art|music/i.test(h)) {
    return { bg: "linear-gradient(135deg,#1a1000,#2d1e00)", icon: "ART", accent: "#fbbf24" };
  }
  return { bg: "linear-gradient(135deg,#0f2d2a,#134e4a)", icon: "DECK", accent: "#5eead4" };
}

export const GARBLED_PATTERN = /(?:\?{3,}|[鬯繝郢譎驛鬩])/;

export function looksGarbled(value = "") {
  return GARBLED_PATTERN.test(String(value));
}

export function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  if (looksGarbled(text) && fallback && !looksGarbled(fallback)) return fallback;
  return text;
}

export function normalizeCard(card) {
  const fallbackDefinition = SAMPLE_CARD_DEFINITIONS[card.id] || "";
  return {
    ...card,
    word: cleanText(card.word),
    definition: cleanText(card.definition, fallbackDefinition),
  };
}

export function normalizeDeck(deck) {
  return {
    ...deck,
    name: cleanText(deck.name),
    author: cleanText(deck.author, "不明"),
    wordLang: normalizeLanguageValue(deck.wordLang),
    defLang: normalizeLanguageValue(deck.defLang),
    tags: (deck.tags || []).map((tag) => cleanText(tag)).filter(Boolean),
    cards: (deck.cards || []).map(normalizeCard),
  };
}

export function normalizeDecks(decks = []) {
  return decks.map(normalizeDeck);
}

export const uid = () => Math.random().toString(36).slice(2, 9);
export const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
