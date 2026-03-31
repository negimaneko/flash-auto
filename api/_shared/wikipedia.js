/**
 * Wikipedia API を使ってキャラクター名+説明文を取得するモジュール。
 * 検索先行パイプライン: LLMに自由生成させず、実在データを先に取得する。
 */

const WIKIPEDIA_API = "https://ja.wikipedia.org/w/api.php";
const WIKIPEDIA_EN_API = "https://en.wikipedia.org/w/api.php";

/**
 * Wikipedia の記事本文からキャラクター名と説明文を抽出する。
 *
 * @param {string} workTitle - 作品タイトル（例: "ちいかわ", "ハズビンホテル"）
 * @returns {Promise<Array<{name: string, description: string}>>} - キャラクター情報の配列。取得失敗時は空配列。
 */
export async function fetchCharacterData(workTitle) {
  // 日本語 Wikipedia → 英語 Wikipedia の順で試行
  const data = await tryFetchFromWikipedia(workTitle, WIKIPEDIA_API);
  if (data.length > 0) return data;

  const dataEn = await tryFetchFromWikipedia(workTitle, WIKIPEDIA_EN_API);
  return dataEn;
}

/**
 * 後方互換: 名前だけの配列を返す
 */
export async function fetchCharacterNames(workTitle) {
  const data = await fetchCharacterData(workTitle);
  return data.map(d => d.name);
}

/**
 * 指定 Wikipedia API から記事を検索し、キャラクター情報を抽出する。
 */
async function tryFetchFromWikipedia(workTitle, apiBase) {
  try {
    // Step 1: 作品タイトルで検索してページタイトルを特定
    const pageTitle = await searchPageTitle(workTitle, apiBase);
    if (!pageTitle) return [];

    // Step 2: 記事の全文（wikitext）を取得
    const wikitext = await fetchPageWikitext(pageTitle, apiBase);
    if (!wikitext) return [];

    // Step 3: 登場人物セクションからキャラクター情報を抽出
    let data = extractCharacterDataFromWikitext(wikitext);

    // Step 3b: 登場人物セクションが見つからなかった場合、
    //          「登場人物」「キャラクター」ページを直接検索
    if (data.length === 0) {
      const characterPageTitle = await searchPageTitle(
        `${workTitle} 登場人物`,
        apiBase
      );
      if (characterPageTitle && characterPageTitle !== pageTitle) {
        const charWikitext = await fetchPageWikitext(characterPageTitle, apiBase);
        if (charWikitext) {
          data = extractCharacterDataFromFullPage(charWikitext);
        }
      }
    }

    return data;
  } catch (err) {
    console.warn(`[wikipedia] Failed to fetch from ${apiBase}: ${err.message}`);
    return [];
  }
}

/**
 * Wikipedia 検索 API でページタイトルを取得する。
 */
async function searchPageTitle(query, apiBase) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "10",
    format: "json",
    utf8: "1",
  });

  const res = await fetch(`${apiBase}?${params}`, {
    headers: { "User-Agent": "FlashAutoApp/1.0 (flashcard study app)" },
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const results = data?.query?.search;
  if (!results || results.length === 0) return null;

  // クエリを含むタイトルを優先的に選ぶ（完全一致 > 前方一致 > 部分一致 > 先頭結果）
  const queryLower = query.toLowerCase();
  const exact = results.find(r => r.title.toLowerCase() === queryLower);
  if (exact) return exact.title;
  const startsWith = results.find(r => r.title.toLowerCase().startsWith(queryLower));
  if (startsWith) return startsWith.title;
  const includes = results.find(r => r.title.toLowerCase().includes(queryLower));
  if (includes) return includes.title;

  return results[0].title;
}

/**
 * Wikipedia の記事本文（wikitext形式）を取得する。
 */
async function fetchPageWikitext(pageTitle, apiBase) {
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    format: "json",
    utf8: "1",
  });

  const res = await fetch(`${apiBase}?${params}`, {
    headers: { "User-Agent": "FlashAutoApp/1.0 (flashcard study app)" },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.parse?.wikitext?.["*"] || null;
}

/**
 * wikitext の「登場人物」「キャラクター」セクションからキャラクター情報を抽出する。
 */
function extractCharacterDataFromWikitext(wikitext) {
  // 登場人物/キャラクター系セクションの開始位置を探す
  const sectionPattern = /^={2,3}\s*(?:登場人物|登場キャラクター|キャラクター|Characters|Main characters|Recurring characters)\s*={2,3}/im;
  const sectionMatch = wikitext.match(sectionPattern);
  if (!sectionMatch) return [];

  const startIndex = sectionMatch.index;

  // 次の同レベル以上のセクションまでを抽出
  const sectionLevel = (sectionMatch[0].match(/^(=+)/)?.[1] || "==").length;
  const endPattern = new RegExp(`^={2,${sectionLevel}}\\s*[^=]`, "m");
  const restText = wikitext.slice(startIndex + sectionMatch[0].length);
  const endMatch = restText.match(endPattern);
  const sectionText = endMatch
    ? restText.slice(0, endMatch.index)
    : restText;

  return extractDataFromSection(sectionText);
}

/**
 * 専用の登場人物ページ全体からキャラクター情報を抽出する。
 */
function extractCharacterDataFromFullPage(wikitext) {
  return extractDataFromSection(wikitext);
}

/**
 * wikitext セクションからキャラクター名+説明文を抽出する。
 *
 * Wikipedia の登場人物セクションは主に以下の構造:
 *
 * パターンA（定義リスト形式）:
 *   ; キャラ名
 *   : 声 - ○○
 *   : 説明文が続く。複数行にわたることもある。
 *
 * パターンB（見出し形式）:
 *   === キャラ名 ===
 *   説明文が続く。
 *
 * パターンC（太字形式）:
 *   '''キャラ名'''
 *   説明文が続く。
 */
function extractDataFromSection(sectionText) {
  const results = new Map(); // name -> description

  // 行ごとに処理して、名前と説明文のペアを構築
  const lines = sectionText.split("\n");
  let currentName = null;
  let currentDesc = [];
  let insideTable = false;
  let tableHeaders = []; // wikitable のヘッダー列名

  for (const line of lines) {
    // ---- wikitable パース: {| ... |} 内の行からキャラクター情報を抽出 ----
    if (/^\{\|/.test(line.trim())) {
      insideTable = true;
      tableHeaders = [];
      continue;
    }
    if (insideTable) {
      if (/^\|\}/.test(line.trim())) {
        insideTable = false;
        tableHeaders = [];
        continue;
      }
      // ヘッダー行: !名前!!正式名!!動物の種類!!...
      if (/^!/.test(line.trim())) {
        tableHeaders = line.replace(/^!\s*/, "").split(/!!/).map(h => cleanDescription(h).trim());
        continue;
      }
      // データ行: |ルビー||ルビー||ウサギ||...
      if (/^\|[^-}]/.test(line.trim())) {
        const cells = line.replace(/^\|\s*/, "").split(/\|\|/).map(c => cleanDescription(c).replace(/^\|+\s*/, "").trim());
        if (cells.length >= 2 && cells[0]) {
          const charName = cleanName(cells[0]);
          if (charName) {
            // ヘッダーがあれば「列名: 値」形式で説明文を構築、なければ2列目以降を結合
            const descParts = [];
            for (let i = 1; i < cells.length; i++) {
              if (!cells[i]) continue;
              if (tableHeaders.length > i && tableHeaders[i]) {
                descParts.push(`${tableHeaders[i]}: ${cells[i]}`);
              } else {
                descParts.push(cells[i]);
              }
            }
            if (descParts.length > 0) {
              results.set(charName, descParts.join("。"));
            }
          }
        }
      }
      // セパレータ行 |- や空行はスキップ
      continue;
    }

    // パターン1: 定義リスト形式 「; キャラ名」
    const defListMatch = line.match(/^;\s*(.+)/);
    if (defListMatch) {
      // 前のキャラクターを保存
      if (currentName) {
        saveCharacter(results, currentName, currentDesc);
      }
      currentName = cleanName(defListMatch[1]);
      currentDesc = [];
      continue;
    }

    // パターン2: 小見出し形式 「=== キャラ名 ===」
    const headingMatch = line.match(/^={3,4}\s*(.+?)\s*={3,4}/);
    if (headingMatch) {
      if (currentName) {
        saveCharacter(results, currentName, currentDesc);
      }
      currentName = cleanName(headingMatch[1]);
      currentDesc = [];
      continue;
    }

    // パターン3: 太字で始まる行 「'''キャラ名'''」（行頭に太字名がある場合）
    const boldStartMatch = line.match(/^\*?\s*'{3}(.+?)'{3}/);
    if (boldStartMatch && !currentName) {
      // 前のキャラクターを保存
      if (currentName) {
        saveCharacter(results, currentName, currentDesc);
      }
      currentName = cleanName(boldStartMatch[1]);
      currentDesc = [];
      // 太字の後に説明が続く場合があるので、残りを説明文として取得
      const rest = line.slice(line.indexOf("'''", line.indexOf("'''") + 3) + 3).trim();
      if (rest) currentDesc.push(rest);
      continue;
    }

    // 説明行（: で始まる行、または普通のテキスト行）
    if (currentName) {
      const descLine = line.replace(/^:\s*/, "").trim();
      if (descLine) {
        currentDesc.push(descLine);
      }
    }
  }

  // 最後のキャラクターを保存
  if (currentName) {
    saveCharacter(results, currentName, currentDesc);
  }

  return [...results.entries()]
    .map(([name, description]) => ({ name, description }))
    .slice(0, 50);
}

/**
 * キャラクター情報をMapに保存する。説明文をクリーンアップして結合。
 */
function saveCharacter(results, name, descLines) {
  if (!name || results.has(name)) return;

  // 声優行を結合前に除去（「声 - ○○」で始まる行を丸ごとスキップ）
  const filteredLines = descLines.filter(line => !/^声\s*[-–—:：]/.test(line));

  // 説明文を結合してクリーンアップ
  const rawDesc = filteredLines.join(" ");
  let cleaned = cleanDescription(rawDesc);

  // 説明文の先頭からキャラクター名自体を除去する。
  // Wikipedia は「○○のキャラクター。」「○○をモチーフにした…」のように
  // キャラ名で始まる記述をすることがあり、LLM が名前を含めない指示に従うと
  // 「のキャラクター。」「をモチーフにした…」のような不完全な文が残ってしまう。
  cleaned = removeLeadingCharacterName(cleaned, name);

  results.set(name, cleaned);
}

/**
 * 説明文の先頭にキャラクター名がある場合、それを除去して文として成立させる。
 * 例: "うさぎのキャラクター。元気で…" → "元気で…"
 *     "モモンガのキャラクター。大きな瞳…" → "大きな瞳…"
 *     "シーサーをモチーフにしたキャラクター。" → "シーサーをモチーフにしたキャラクター。" (名前が意味の一部なので保持)
 */
function removeLeadingCharacterName(desc, name) {
  if (!desc || !name) return desc;

  // パターン: "[名前]のキャラクター。" → キャラクター名+助詞+「キャラクター」を除去
  // 「のキャラクター」「というキャラクター」等で始まる場合
  const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leadingNamePattern = new RegExp(`^${nameEscaped}(?:の|という|は|が)(?:キャラクター|登場人物|マスコット)[。．、,]*\\s*`, "i");
  const stripped = desc.replace(leadingNamePattern, "");

  // 除去した結果が空になったり、助詞で始まる不完全な文になったりしないか確認
  if (stripped && stripped.length > 5 && !/^[のをはがでと]/.test(stripped)) {
    return stripped;
  }

  return desc;
}

/**
 * Wikipedia の説明文をクリーンアップする。
 * wikiマークアップ、参照、テンプレート等を除去してプレーンテキストにする。
 */
function cleanDescription(raw) {
  let desc = raw;

  // ref タグと中身を除去: <ref>...</ref> <ref name="...">...</ref> <ref ... />
  desc = desc.replace(/<ref[^>]*\/>/gi, "");
  desc = desc.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");

  // HTMLタグ除去
  desc = desc.replace(/<[^>]+>/g, "");

  // wikitable {| ... |} 除去
  desc = desc.replace(/\{\|[\s\S]*?\|\}/g, "");

  // テンプレート {{...}} 除去（ネストあり対応: 最大2レベル）
  desc = desc.replace(/\{\{[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}/g, "");
  desc = desc.replace(/\{\{[^}]*\}\}/g, "");

  // wikiリンク [[表示名|リンク先]] → 表示名、[[名前]] → 名前
  desc = desc.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");

  // 余分な空白・改行を整理
  desc = desc.replace(/\s+/g, " ").trim();

  // 長すぎる場合は切り詰め（LLMプロンプトに収めるため）
  if (desc.length > 300) {
    desc = desc.slice(0, 300).replace(/[。、.,]\s*\S*$/, "") + "。";
  }

  return desc;
}

/**
 * 後方互換: 名前のみ抽出する関数群
 */
function extractCharacterNamesFromWikitext(wikitext) {
  return extractCharacterDataFromWikitext(wikitext).map(d => d.name);
}

function extractNamesFromSection(sectionText) {
  return extractDataFromSection(sectionText).map(d => d.name);
}

/**
 * 抽出した名前をクリーンアップする。
 * wikiリンク、声優情報、読みがな等を除去して名前だけにする。
 */
function cleanName(raw) {
  let name = raw.trim();

  // wikiリンク [[表示名|リンク先]] → 表示名、[[名前]] → 名前
  name = name.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1");

  // HTMLタグ除去
  name = name.replace(/<[^>]+>/g, "");

  // テンプレート {{...}} 除去
  name = name.replace(/\{\{[^}]*\}\}/g, "");

  // 声優情報を除去: 「（声 - ○○）」「(CV: ○○)」等
  name = name.replace(/[（(]\s*(?:声|CV|声優|Voice|voiced by)\s*[:：\-]?\s*[^）)]*[）)]/gi, "");

  // 読みがな除去: 「キャラ名（かな）」
  name = name.replace(/[（(][ぁ-んァ-ヶー、\s]+[）)]/g, "");

  // 残った括弧内の補足を除去（丸括弧・山括弧）
  name = name.replace(/[（(][^）)]*[）)]/g, "");
  name = name.replace(/[〈<][^〉>]*[〉>]/g, "");

  // スラッシュ区切り対応: 「"コードネーム" / 本名」→ 本名部分を採用
  if (name.includes("/")) {
    const parts = name.split("/").map(p => p.replace(/[""\s]/g, "").trim()).filter(Boolean);
    name = parts[parts.length - 1] || parts[0] || name;
  }

  // ダブルクォート除去
  name = name.replace(/[""\u201C\u201D]/g, "").trim();

  // 先頭の記号や空白を除去
  name = name.replace(/^[\s;:*#・\-–—]+/, "").trim();

  // 末尾の記号除去
  name = name.replace(/[\s,、。.]+$/, "").trim();

  // 名前として妥当か検証（1文字以上、長すぎない、数字だけではない）
  if (!name || name.length > 30 || /^\d+$/.test(name)) return null;

  // セクション見出しっぽいものを除外
  if (/^(登場人物|登場キャラクター|キャラクター|Characters|声優|スタッフ|主題歌|関連項目|脚注|外部リンク|参考文献|主要キャラクター|サブキャラクター|その他)$/.test(name)) return null;

  return name;
}

export { extractCharacterNamesFromWikitext, extractNamesFromSection, cleanName };
