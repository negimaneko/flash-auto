import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_OLLAMA_MODEL = 'qwen3:1.7b'

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

// --- deck-cache helpers (local dev, no Supabase) ---

function normalizeLanguageValue(value, fallback = 'ja') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeWordKey(word) {
  return String(word ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseDeckPayload(raw) {
  const cleaned = String(raw || '').split('```json').join('').split('```').join('').trim()
  return JSON.parse(cleaned)
}

function sanitizeCards(cards, minCards, maxCards, excludedWords = []) {
  const excluded = new Set(excludedWords.map(normalizeWordKey))
  const seen = new Set()

  const sanitized = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.word && card?.definition)
    .map((card) => ({
      word: String(card.word).trim(),
      definition: String(card.definition).trim(),
    }))
    .filter((card) => {
      const key = normalizeWordKey(card.word)
      if (!key || excluded.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxCards)

  if (sanitized.length < minCards) {
    throw new Error('AI returned an invalid deck.')
  }

  return sanitized
}

function buildInitialPrompt({ topic, wordLang, defLang, detailLevel }) {
  const detailInstructions = detailLevel === 1
    ? 'Each definition should be one short sentence.'
    : detailLevel === 2
      ? 'Each definition should be 2-3 sentences.'
      : 'Each definition should be detailed and include examples.'

  const wordLangInstruction = wordLang && wordLang !== 'technical'
    ? `Word/term language: ${wordLang} (write each word/term in ${wordLang}).`
    : 'Words/terms should be in the original language commonly used for the topic.'

  return [
    `Create a study flashcard deck about: ${topic}`,
    'Number of cards: 10 to 15.',
    'You must always return at least 10 cards in the cards array.',
    'Start from the 10 most important cards.',
    'If there are additional must-know terms that do not fit within those 10, you may add up to 5 extra cards.',
    'Only add extra cards when they are clearly essential.',
    'Never return fewer than 10 cards, and never return more than 15 cards.',
    wordLangInstruction,
    `Definition language: ${defLang}`,
    detailInstructions,
    'Return JSON only: {"deckName":"...","tags":["#tag1","#tag2"],"cards":[{"word":"...","definition":"..."}]}',
  ].join('\n')
}

function buildContinuationPrompt({ topic, wordLang, defLang, detailLevel, existingWords }) {
  const detailInstructions = detailLevel === 1
    ? 'Each definition should be one short sentence.'
    : detailLevel === 2
      ? 'Each definition should be 2-3 sentences.'
      : 'Each definition should be detailed and include examples.'

  const wordLangInstruction = wordLang && wordLang !== 'technical'
    ? `Word/term language: ${wordLang} (write each word/term in ${wordLang}).`
    : 'Words/terms should be in the original language commonly used for the topic.'

  return [
    `Continue a study flashcard deck about: ${topic}`,
    `Already generated words: ${existingWords.join(', ')}`,
    'Generate 5 to 10 additional cards.',
    'Every new card must be a new term and must not duplicate or paraphrase any existing word.',
    'Only add genuinely useful next-step terms that expand the deck.',
    wordLangInstruction,
    `Definition language: ${defLang}`,
    detailInstructions,
    'Return JSON only: {"cards":[{"word":"...","definition":"..."}]}',
  ].join('\n')
}

async function requestGroqChatDirect(apiKey, prompt, maxTokens) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Groq request failed')
  }

  const text = data.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('AI returned an empty response')
  return text
}

async function requestOllamaChatDirect(baseUrl, model, prompt, maxTokens) {
  const resolvedModel = await resolveOllamaModel(baseUrl, model)
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: resolvedModel,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: maxTokens || 4000 },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Ollama request failed')
  }

  const text = String(data.response || '').trim()
  if (!text) throw new Error('Ollama returned an empty response')
  return text
}

async function requestAIChatDirect(apiKey, ollamaBaseUrl, ollamaModel, prompt, maxTokens) {
  // Try Ollama first (local), then Groq (cloud)
  try {
    return await requestOllamaChatDirect(ollamaBaseUrl, ollamaModel, prompt, maxTokens)
  } catch {
    // Ollama unavailable, try Groq
  }

  if (apiKey) {
    return await requestGroqChatDirect(apiKey, prompt, maxTokens)
  }

  throw new Error('AI生成に失敗しました。Ollamaが起動していないか、GROQ_API_KEYが設定されていません。')
}

/// --- /api/track: ローカル開発時も Supabase に保存する ---

const ALLOWED_TRACK_EVENTS = new Set([
  'app_open', 'signup_guest', 'generate_word', 'generate_theme_deck',
  'save_deck', 'review_card', 'return_visit', 'login_upgrade',
])

async function handleTrackProxy(req, res, supabaseUrl, supabaseKey) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return }

  // Supabase 未設定時はスキップ（200 を返すだけ）
  if (!supabaseUrl || !supabaseKey) {
    sendJson(res, 200, { ok: true })
    return
  }

  let body
  try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return }

  const { anonymousUserId, eventName, metadata, isInternal } = body || {}

  if (!anonymousUserId || typeof anonymousUserId !== 'string' || anonymousUserId.length > 128) {
    sendJson(res, 400, { error: 'anonymousUserId is required' }); return
  }
  if (!eventName || !ALLOWED_TRACK_EVENTS.has(eventName)) {
    sendJson(res, 400, { error: 'Invalid eventName' }); return
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const upsertData = {
      anonymous_user_id: anonymousUserId,
      last_seen_at: new Date().toISOString(),
    }
    if (isInternal === true) {
      upsertData.is_internal = true
    }

    const { data: user, error: upsertError } = await supabase
      .from('users')
      .upsert(upsertData, { onConflict: 'anonymous_user_id' })
      .select('id')
      .single()

    if (upsertError) throw upsertError

    const { error: insertError } = await supabase.from('events').insert({
      user_id: user.id,
      event_name: eventName,
      metadata: metadata || null,
    })

    if (insertError) throw insertError
  } catch (e) {
    console.error('[/api/track] error:', e?.message ?? e)
  }

  sendJson(res, 200, { ok: true })
}

async function handleDeckCacheProxy(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return }

  let body
  try { body = await readJsonBody(req) } catch { sendJson(res, 400, { error: 'Invalid JSON body' }); return }

  const action = String(body.action || 'initial').trim()
  const topic = String(body.topic || '').trim()
  const wordLang = normalizeLanguageValue(body.wordLang, 'technical')
  const defLang = normalizeLanguageValue(body.defLang)
  const detailLevel = Number(body.detailLevel || 2)
  const mustIncludeWords = String(body.mustIncludeWords || '').trim()

  if (!topic) { sendJson(res, 400, { error: 'topic is required' }); return }

  try {
    // 本番と同じ api/deck-cache.js の生成ロジックを使用
    const { generateInitialDeck, generateContinuationCards } = await import('./api/deck-cache.js')

    if (action === 'initial') {
      const generated = await generateInitialDeck({ topic, wordLang, defLang, detailLevel, mustIncludeWords })
      sendJson(res, 200, {
        source: 'generated',
        cacheId: null,
        deck: {
          deckName: generated.deckName,
          tags: generated.tags,
          cards: generated.cards,
          wordLang,
          defLang,
          detailLevel,
        },
      })
      return
    }

    if (action === 'continue') {
      const existingWords = Array.isArray(body.existingWords)
        ? body.existingWords.map((w) => String(w || '').trim()).filter(Boolean)
        : []

      const continuationCards = await generateContinuationCards({
        topic, wordLang, defLang, detailLevel, existingWords,
      })

      sendJson(res, 200, {
        source: 'continued',
        addedCount: continuationCards.length,
        cacheId: null,
        deck: { cards: continuationCards },
      })
      return
    }

    sendJson(res, 400, { error: 'Unsupported action' })
  } catch (error) {
    console.error('[deck-cache proxy] error:', error instanceof Error ? error.message : error)
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Deck generation failed' })
  }
}

// --- Groq proxy ---

async function handleGroqProxy(req, res, apiKey) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (!apiKey) {
    sendJson(res, 500, {
      error: 'GROQ_API_KEY is not configured. Set it in Vercel or your local .env.local file.',
    })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  if (!body.prompt) {
    sendJson(res, 400, { error: 'prompt is required' })
    return
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: body.prompt }],
        max_tokens: body.maxTokens || 1024,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (!response.ok || data.error) {
      sendJson(res, response.status, { error: data.error?.message || 'Groq request failed' })
      return
    }

    sendJson(res, 200, { text: data.choices?.[0]?.message?.content || '' })
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' })
  }
}

async function resolveOllamaModel(baseUrl, configuredModel) {
  if (configuredModel) return configuredModel

  try {
    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) return DEFAULT_OLLAMA_MODEL

    const data = await response.json()
    const models = Array.isArray(data?.models) ? data.models : []
    const qwenModel = models.find((model) => /qwen/i.test(String(model?.name || '')))
    return qwenModel?.name || DEFAULT_OLLAMA_MODEL
  } catch {
    return DEFAULT_OLLAMA_MODEL
  }
}

async function handleOllamaProxy(req, res, baseUrl, configuredModel) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  if (!body.prompt) {
    sendJson(res, 400, { error: 'prompt is required' })
    return
  }

  const model = await resolveOllamaModel(baseUrl, configuredModel)

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: body.prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: body.maxTokens || 1024,
        },
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      sendJson(res, response.status, { error: data.error || 'Ollama request failed' })
      return
    }

    sendJson(res, 200, { text: data.response || '', model })
  } catch (error) {
    sendJson(res, 503, {
      error: error instanceof Error ? error.message : 'Ollama is unavailable',
    })
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY
  const ollamaBaseUrl = (env.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '')
  const ollamaModel = env.OLLAMA_MODEL || process.env.OLLAMA_MODEL || ''
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || ''
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  // .env.local の値を process.env にも反映（api/deck-cache.js が process.env から読むため）
  const envKeys = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL']
  for (const key of envKeys) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key]
    }
  }

  return {
    test: {
      exclude: [
        ".claude/**",
        "node_modules/**",
      ],
    },
    plugins: [
      react(),
      {
        name: 'local-ai-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/track')) {
              await handleTrackProxy(req, res, supabaseUrl, supabaseKey)
              return
            }

            if (req.url?.startsWith('/api/deck-cache')) {
              await handleDeckCacheProxy(req, res)
              return
            }

            if (req.url?.startsWith('/api/ollama')) {
              await handleOllamaProxy(req, res, ollamaBaseUrl, ollamaModel)
              return
            }

            if (!req.url?.startsWith('/api/groq') && !req.url?.startsWith('/api/gemini')) {
              next()
              return
            }

            await handleGroqProxy(req, res, apiKey)
          })
        },
      },
    ],
  }
})
