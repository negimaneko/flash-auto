export const LANGUAGES = [
  { code: "en", label: "英語", native: "English" },
  { code: "technical", label: "専門用語" },
  { code: "zh", label: "中国語", native: "中文" },
  { code: "ko", label: "韓国語", native: "한국어" },
  { code: "fr", label: "フランス語", native: "Français" },
  { code: "de", label: "ドイツ語", native: "Deutsch" },
  { code: "es", label: "スペイン語", native: "Español" },
  { code: "it", label: "イタリア語", native: "Italiano" },
  { code: "pt", label: "ポルトガル語", native: "Português" },
  { code: "ru", label: "ロシア語", native: "Русский" },
  { code: "ar", label: "アラビア語", native: "العربية" },
  { code: "hi", label: "ヒンディー語", native: "हिन्दी" },
  { code: "th", label: "タイ語", native: "ไทย" },
  { code: "vi", label: "ベトナム語", native: "Tiếng Việt" },
  { code: "id", label: "インドネシア語", native: "Bahasa Indonesia" },
  { code: "ms", label: "マレー語", native: "Bahasa Melayu" },
  { code: "tl", label: "タガログ語", native: "Tagalog" },
  { code: "nl", label: "オランダ語", native: "Nederlands" },
  { code: "sv", label: "スウェーデン語", native: "Svenska" },
  { code: "da", label: "デンマーク語", native: "Dansk" },
  { code: "no", label: "ノルウェー語", native: "Norsk" },
  { code: "fi", label: "フィンランド語", native: "Suomi" },
  { code: "pl", label: "ポーランド語", native: "Polski" },
  { code: "cs", label: "チェコ語", native: "Čeština" },
  { code: "hu", label: "ハンガリー語", native: "Magyar" },
  { code: "ro", label: "ルーマニア語", native: "Română" },
  { code: "uk", label: "ウクライナ語", native: "Українська" },
  { code: "el", label: "ギリシャ語", native: "Ελληνικά" },
  { code: "tr", label: "トルコ語", native: "Türkçe" },
  { code: "he", label: "ヘブライ語", native: "עברית" },
  { code: "fa", label: "ペルシャ語", native: "فارسی" },
  { code: "bn", label: "ベンガル語", native: "বাংলা" },
  { code: "ta", label: "タミル語", native: "தமிழ்" },
  { code: "te", label: "テルグ語", native: "తెలుగు" },
  { code: "ur", label: "ウルドゥー語", native: "اردو" },
  { code: "sw", label: "スワヒリ語", native: "Kiswahili" },
  { code: "my", label: "ミャンマー語", native: "မြန်မာ" },
  { code: "km", label: "クメール語", native: "ខ្មែរ" },
  { code: "lo", label: "ラオ語", native: "ລາວ" },
  { code: "mn", label: "モンゴル語", native: "Монгол" },
  { code: "ka", label: "ジョージア語", native: "ქართული" },
  { code: "hy", label: "アルメニア語", native: "Հայերեն" },
  { code: "la", label: "ラテン語", native: "Latina" },
  { code: "ja", label: "日本語", native: "日本語" },
];


export const LIMITS = { NAME: 50, TOPIC: 200, MUST: 200, WORD: 100, DEF: 500 };

export const DETAIL_LEVELS = [
  { id: 1, label: "短め", desc: "短い1文" },
  { id: 2, label: "標準", desc: "2〜3文" },
  { id: 3, label: "詳しく", desc: "例や文脈を含む" },
];

export const WORD_COUNTS = [
  { id: 1, label: "少なめ", desc: "10〜20語", min: 10, max: 20 },
  { id: 2, label: "標準", desc: "20〜30語", min: 20, max: 30 },
  { id: 3, label: "多め", desc: "30〜50語", min: 30, max: 50 },
];

export const SPLASH_DURATION_MS = 2000;
export const SPLASH_LOGO_SRC = "/icon.png";
export const SPLASH_LOGO_ALT = "flash auto";
