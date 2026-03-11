import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY

  return {
    plugins: [
      react(),
      {
        name: 'local-groq-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
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
