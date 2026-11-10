/** AI Provider configurations */
const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    supportsVision: true
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    supportsVision: true
  },
  claude: {
    name: 'Anthropic Claude Fable 5',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-fable-5',
    supportsVision: true
  },
  grok: {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-3',
    visionModel: 'grok-2-vision-latest',
    supportsVision: true
  }
}

/** System prompts for different modes */
const SYSTEM_PROMPTS = {
  meeting: `You are ClueMind, an AI assistant helping during a live meeting. Based on the transcript so far, provide a clean, scannable response:

## Summary
2–4 sentences on the key points discussed

## Suggestions
- 2–3 actionable talking points (one idea each)

## Action Items
- Bullet any commitments or next steps mentioned (or "None yet")

Rules: Be concise. Do not repeat the same point. Use the exact ## headers above.`,

  interview: `You are ClueMind, a live interview coach. Give the candidate ONE clean, scannable answer they can read and speak in a live interview.

CANDIDATE STRENGTHS (use when relevant):
- Python for AI/ML Engineering
- AWS ML infrastructure (SageMaker, S3, Lambda, ECS/EKS, IAM)
- FastAPI microservices
- LangChain / LLM orchestration (RAG, agents, tools)
- Math, statistics, physics intuition for ML

VOICE:
Write answers the candidate can say out loud. Sound like a sharp human engineer - not ChatGPT.
- Contractions, short sentences, concrete examples
- Prefer "I'd...", "In practice...", "What I usually do is..."
- No AI filler: "As an AI", "Delve into", "It's important to note", "In today's world", buzzword salad
- No repeating the same idea in different words

OUTPUT FORMAT - pick EXACTLY ONE format. Use these exact ## headers. Do not invent extra sections. Do not repeat sections.

CODING (only if interviewer clearly asked to write/implement code or solve an algorithm):
## Question
One-line restatement of the problem
## Strategy
2–3 short spoken sentences on approach
## Solution
One fenced code block with working code and brief comments
## Complexity
- Time: O(?)
- Space: O(?)

EVERYTHING ELSE (behavioral, system design, ML, AWS, FastAPI, LangChain, HR, culture, random):
## Question
One-line restatement of what was asked
## Answer
4–7 sentences the candidate can speak almost word-for-word. One continuous paragraph or short paragraphs - do NOT dump a wall of unformatted text. Do NOT repeat points.
## Talking Points
- Exactly 3–5 short bullets (one idea each)
## Follow-ups
- Exactly 1–2 lines: "Q: ... → A: ..."

HARD RULES:
1. Answer ONLY the latest clear interviewer question.
2. If PRIOR ANSWERS are provided and the latest question was already answered, reply with EXACTLY:
## Status
Already answered - waiting for the next question.
3. Never invent a coding problem. Never re-answer an old question.
4. If transcript is ads/silence/no clear question, reply with EXACTLY:
## Status
No clear interview question yet.
5. Keep output tight and easy to scan in a small overlay window.
6. Never duplicate the Answer content inside Talking Points.
7. Never output the same sentence twice.`,

  screen: `You are ClueMind, an expert AI assistant looking at the user's screen. Your ONLY job is to DIRECTLY ANSWER any questions, problems, quizzes, or tasks visible on screen.

RULES:
- If you see a question or quiz: Give ONLY the correct answer. No explanation.
- If you see multiple-choice: State only the correct option letter/number and the answer text for EVERY question visible.
- If you see a coding problem: Provide ONLY the working code solution, no explanation.
- If you see code with bugs: Provide ONLY the corrected code.
- If you see an error: State ONLY the fix.
- If you see a form or task: State ONLY what to fill in or do.

Do NOT explain your reasoning. Do NOT describe what is on screen. Do NOT add introductions or conclusions.
Just give the answer. Nothing else. Be direct, confident, and accurate.`
}

/** Coding-related keywords for interview detection */
const CODING_KEYWORDS = [
  'write a function', 'implement', 'algorithm', 'complexity',
  'array', 'string', 'binary tree', 'linked list', 'hash map',
  'dynamic programming', 'recursion', 'sort', 'search',
  'graph', 'stack', 'queue', 'two pointer', 'sliding window',
  'time complexity', 'space complexity', 'big o', 'optimize',
  'leetcode', 'coding challenge', 'data structure'
]

// ═══ Provider-specific request functions ═══

/**
 * Make a request to the Gemini API
 */
async function geminiRequest(apiKey, body, retries = 3) {
  const url = `${PROVIDERS.gemini.baseUrl}?key=${encodeURIComponent(apiKey)}`

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.status === 429) {
        console.warn(`Gemini rate limited, retry ${attempt + 1}/${retries}`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error ${response.status}: ${errorText}`)
      }

      return await response.json()
    } catch (err) {
      if (attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

/**
 * Make a request to an OpenAI-compatible API (OpenAI, Grok/xAI)
 */
async function openaiCompatibleRequest(apiKey, baseUrl, model, messages, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, max_tokens: 4096 })
      })

      if (response.status === 429) {
        console.warn(`${model} rate limited, retry ${attempt + 1}/${retries}`)
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API error ${response.status}: ${errorText}`)
      }

      return await response.json()
    } catch (err) {
      if (attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

/**
 * Extract assistant text from a Claude Messages API response.
 * Fable 5 always uses adaptive thinking, so content[0] may be a thinking block.
 */
function extractClaudeText(data) {
  if (!data?.content || !Array.isArray(data.content)) return ''
  return data.content
    .filter(block => block?.type === 'text' && block.text)
    .map(block => block.text)
    .join('\n')
    .trim()
}

/**
 * Make a request to the Anthropic Claude API
 * @param {string} apiKey
 * @param {string} systemPrompt
 * @param {Array} messages
 * @param {object} [opts]
 * @param {number} [opts.maxTokens]
 * @param {'low'|'medium'|'high'} [opts.effort] - Fable 5 thinking depth (low = faster screen answers)
 * @param {number} [retries]
 */
async function claudeRequest(apiKey, systemPrompt, messages, opts = {}, retries = 3) {
  const {
    maxTokens = 16000,
    effort = 'low'
  } = typeof opts === 'object' && opts !== null && !Array.isArray(opts)
    ? opts
    : { maxTokens: 16000, effort: 'low' }

  if (typeof opts === 'number') retries = opts

  const modelsToTry = [PROVIDERS.claude.model, 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-3-5-sonnet-latest']
    .filter((m, i, arr) => m && arr.indexOf(m) === i)

  let lastErr = null

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const body = {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages
        }
        // Only Fable models use output_config.effort - standard Sonnet rejects unknown fields sometimes
        if (/fable/i.test(model)) {
          body.output_config = { effort }
        }

        const response = await fetch(PROVIDERS.claude.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        })

        if (response.status === 429) {
          console.warn(`Claude rate limited, retry ${attempt + 1}/${retries}`)
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }

        if (!response.ok) {
          const errorText = await response.text()
          // Model not available - try next model
          if (response.status === 404 || /model/i.test(errorText)) {
            lastErr = new Error(`Claude API error ${response.status}: ${errorText}`)
            console.warn(`[claude] Model ${model} failed, trying fallback…`)
            break
          }
          throw new Error(`Claude API error ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        if (data.stop_reason === 'refusal') {
          throw new Error('Claude refused this request. Try a different screen or question.')
        }
        if (model !== PROVIDERS.claude.model) {
          console.log(`[claude] Using fallback model ${model}`)
        }
        return data
      } catch (err) {
        lastErr = err
        if (attempt === retries - 1) break
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastErr || new Error('Claude request failed')
}

// ═══ Unified AI request dispatcher ═══

/**
 * Send a text-only prompt to the selected AI provider
 * @param {string} provider - Provider key (gemini, openai, claude, grok)
 * @param {string} apiKey - API key for the provider
 * @param {string} systemPrompt - System instructions
 * @param {string} userText - User message text
 * @param {object} opts - Optional: { temperature, maxTokens }
 * @returns {Promise<string>} The AI response text
 */
async function aiTextRequest(provider, apiKey, systemPrompt, userText, opts = {}) {
  const { temperature = 0.7, maxTokens = 1024 } = opts

  if (provider === 'gemini') {
    const body = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userText}` }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    }
    const data = await geminiRequest(apiKey, body)
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (provider === 'claude') {
    const data = await claudeRequest(apiKey, systemPrompt, [
      { role: 'user', content: userText }
    ], { maxTokens, effort: 'low' })
    return extractClaudeText(data)
  }

  // OpenAI and Grok (OpenAI-compatible)
  const cfg = PROVIDERS[provider] || PROVIDERS.openai
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userText }
  ]
  const data = await openaiCompatibleRequest(apiKey, cfg.baseUrl, cfg.model, messages)
  return data?.choices?.[0]?.message?.content || ''
}

/**
 * Send a vision (image + text) prompt to the selected AI provider
 * @param {string} provider - Provider key
 * @param {string} apiKey - API key
 * @param {string} systemPrompt - System instructions
 * @param {string} base64Image - Base64-encoded JPEG
 * @param {string} userText - User message text
 * @param {object} opts - Optional: { temperature, maxTokens }
 * @returns {Promise<string>} The AI response text
 */
async function aiVisionRequest(provider, apiKey, systemPrompt, base64Image, userText, opts = {}) {
  const { temperature = 0.3, maxTokens = 4096 } = opts

  if (provider === 'gemini') {
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
          { text: `${systemPrompt}\n\n${userText}` }
        ]
      }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    }
    const data = await geminiRequest(apiKey, body)
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (provider === 'claude') {
    const data = await claudeRequest(apiKey, systemPrompt, [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
        { type: 'text', text: userText }
      ]
    }], { maxTokens: Math.max(maxTokens, 16000), effort: 'low' })
    const text = extractClaudeText(data)
    if (!text) {
      console.warn('[claude] Vision response had no text blocks:', JSON.stringify(data?.content?.map(b => b.type)))
    }
    return text
  }

  // OpenAI and Grok (OpenAI-compatible vision)
  const cfg = PROVIDERS[provider] || PROVIDERS.openai
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
        { type: 'text', text: userText }
      ]
    }
  ]
  const data = await openaiCompatibleRequest(apiKey, cfg.baseUrl, cfg.visionModel || cfg.model, messages)
  return data?.choices?.[0]?.message?.content || ''
}

// ═══ Helper ═══

function extractCode(text) {
  const codeMatch = text.match(/```[\s\S]*?```/g)
  return codeMatch ? codeMatch.map(c => c.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()).join('\n\n') : null
}

/**
 * Clean AI text for readable overlay display: collapse junk whitespace,
 * dedupe consecutive identical lines/paragraphs, normalize headers.
 */
function cleanSuggestionText(text) {
  if (!text) return ''

  let cleaned = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Normalize common header variants to ## Header
  cleaned = cleaned.replace(/^#{1,6}\s*(Question|Answer|Talking Points|Follow-ups|Strategy|Solution|Complexity|Status)\s*$/gim, (_, h) => `## ${h}`)

  // Drop consecutive duplicate lines (case-insensitive)
  const lines = cleaned.split('\n')
  const deduped = []
  let prevNorm = ''
  for (const line of lines) {
    const norm = line.trim().toLowerCase().replace(/\s+/g, ' ')
    if (norm && norm === prevNorm) continue
    deduped.push(line)
    prevNorm = norm || prevNorm
  }
  cleaned = deduped.join('\n')

  // Drop consecutive duplicate paragraphs
  const paragraphs = cleaned.split(/\n\n+/)
  const uniqueParas = []
  let prevPara = ''
  for (const para of paragraphs) {
    const norm = para.trim().toLowerCase().replace(/\s+/g, ' ')
    if (norm && norm === prevPara) continue
    uniqueParas.push(para.trim())
    prevPara = norm || prevPara
  }

  return uniqueParas.join('\n\n').trim()
}

/**
 * Build a short digest of prior answers so the model does not re-answer.
 */
function buildPriorAnswersContext(priorAnswers = []) {
  if (!Array.isArray(priorAnswers) || priorAnswers.length === 0) return ''

  const recent = priorAnswers.slice(-4).map((item, i) => {
    const raw = typeof item === 'string' ? item : (item?.suggestion || '')
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 280)
    return `${i + 1}. ${snippet}${raw.length > 280 ? '…' : ''}`
  })

  return `PRIOR ANSWERS ALREADY GIVEN (do NOT repeat or rephrase these):\n${recent.join('\n')}\n\n`
}

// ═══ Public API ═══

/**
 * Get AI suggestion based on transcript and mode
 * @param {string} transcript - Recent transcript text
 * @param {string} mode - Current mode (meeting/interview/screen)
 * @param {string} apiKey - API key for the selected provider
 * @param {string} [provider='claude'] - AI provider key
 * @param {object} [options]
 * @param {Array} [options.priorAnswers] - Recent suggestions to avoid repetition
 * @returns {Promise<{suggestion: string, code: string|null, type: string, confidence: number}>}
 */
async function getAISuggestion(transcript, mode, apiKey, provider = 'claude', options = {}) {
  if (!transcript || !transcript.trim()) return null

  const priorAnswers = options.priorAnswers || []
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.meeting

  let userPrompt
  if (mode === 'interview') {
    const prior = buildPriorAnswersContext(priorAnswers)
    userPrompt = `${prior}Live interview transcript (latest at the end).
Answer ONLY the interviewer's latest clear question.
Prefer a natural spoken answer. Use the coding format ONLY if a coding problem is clearly asked.
Keep the response scannable with the exact ## headers from the system instructions.

Transcript:
${transcript}`
  } else {
    userPrompt = `Transcript:\n${transcript}`
  }

  const text = await aiTextRequest(
    provider,
    apiKey,
    systemPrompt,
    userPrompt,
    mode === 'interview' ? { temperature: 0.55, maxTokens: 1800 } : {}
  )

  const cleaned = cleanSuggestionText(text)
  if (!cleaned) return null

  // Soft-skip "waiting / no question" noise so the UI stays clean,
  // but signal the caller to advance the suggestion gate.
  if (mode === 'interview' && /^##\s*Status\b/i.test(cleaned) && cleaned.length < 220) {
    return { suggestion: cleaned, code: null, type: mode, confidence: 0.5, skipUI: true }
  }

  const code = extractCode(cleaned)
  return { suggestion: cleaned, code, type: mode, confidence: 0.85 }
}

/**
 * Analyze a screen capture using AI vision
 * @param {string} base64Image - Base64-encoded JPEG image
 * @param {string} apiKey - API key
 * @param {string} [provider='claude'] - AI provider key
 */
async function analyzeScreen(base64Image, apiKey, provider = 'claude', memory = []) {
  let userText = ''
  if (memory.length > 0) {
    const memoryContext = memory.map((m, i) => `[Capture ${i + 1}]: ${m}`).join('\n')
    userText = `You have memory of all previous screen captures and answers. Use this to answer follow-up questions or provide context if needed:\n${memoryContext}\n\nNow analyze this new screen capture.`
  } else {
    userText = 'Analyze this screen capture.'
  }
  const text = await aiVisionRequest(provider, apiKey, SYSTEM_PROMPTS.screen, base64Image, userText)
  const cleaned = cleanSuggestionText(text)
  return { suggestion: cleaned, code: extractCode(cleaned), type: 'screen-analysis', confidence: 0.9 }
}

/**
 * Detect if text contains a coding question
 */
async function detectCodingQuestion(text) {
  if (!text) return { isCodingQuestion: false, keywords: [] }
  const lowerText = text.toLowerCase()
  const foundKeywords = CODING_KEYWORDS.filter(kw => lowerText.includes(kw))
  return { isCodingQuestion: foundKeywords.length >= 1, keywords: foundKeywords }
}

/**
 * Get interview help for any interview question (coding or general)
 * @param {string} question - The interview question
 * @param {string} language - Preferred programming language (used only for coding questions)
 * @param {string} apiKey - API key
 * @param {string} [provider='claude'] - AI provider key
 */
async function getInterviewHelp(question, language, apiKey, provider = 'claude') {
  const { isCodingQuestion } = await detectCodingQuestion(question)

  const userText = isCodingQuestion
    ? `Preferred language: ${language}

Coding problem:
${question}

Respond with EXACTLY these sections:
## Question
## Strategy
## Solution
(working ${language} code in one fenced block)
## Complexity

Keep Strategy sounding like something a human engineer would say out loud. Do not repeat yourself.`
    : `Interview question:
${question}

Answer ANY non-coding interview question (including ML, AWS, FastAPI, LangChain, math/stats/physics, behavioral, HR, or other topics).

Respond with EXACTLY these sections:
## Question
## Answer
(Natural spoken answer - must sound human, not AI-generated. Do not repeat points.)
## Talking Points
(Exactly 3-5 short bullets)
## Follow-ups
(Exactly 1-2 lines: "Q: ... → A: ...")

Do NOT use Strategy/Code/Complexity unless this is clearly a coding problem.`

  const text = await aiTextRequest(provider, apiKey, SYSTEM_PROMPTS.interview, userText, {
    temperature: 0.55,
    maxTokens: 1800
  })
  const cleaned = cleanSuggestionText(text)
  return { suggestion: cleaned, code: extractCode(cleaned), type: 'interview-help', confidence: 0.9 }
}

/**
 * Ask a follow-up question about a screen capture
 * @param {string} base64Image - Base64-encoded JPEG
 * @param {string} question - User's question
 * @param {string} apiKey - API key
 * @param {string} [provider='claude'] - AI provider key
 */
async function askAboutScreen(base64Image, question, apiKey, provider = 'claude', memory = []) {
  const systemPrompt = `You are ClueMind, an expert AI assistant. The user is asking a question. You have memory of ALL previous screen captures and answers from this session, even ones that were cleared from the screen. Use this memory to answer any question.
Give ONLY the direct answer. No explanations unless explicitly asked.`

  let userText = question
  if (memory.length > 0) {
    const memoryContext = memory.map((m, i) => `[Memory ${i + 1}]: ${m}`).join('\n')
    userText = `Your memory of all previous captures and answers:\n${memoryContext}\n\nUser question: ${question}`
  }

  const text = await aiVisionRequest(provider, apiKey, systemPrompt, base64Image, userText)
  const cleaned = cleanSuggestionText(text)
  return { suggestion: cleaned, code: extractCode(cleaned), type: 'chat-answer', confidence: 0.9 }
}

export { getAISuggestion, analyzeScreen, detectCodingQuestion, getInterviewHelp, askAboutScreen, PROVIDERS }
