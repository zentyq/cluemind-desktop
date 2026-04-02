const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/** System prompts for different modes */
const SYSTEM_PROMPTS = {
  meeting: `You are ClueMind, an AI assistant helping during a live meeting. Based on the transcript so far, provide:
1. A brief summary of the key points discussed
2. 2-3 actionable suggestions or talking points
3. Any action items mentioned
Be concise and direct. Format with clear headers.`,

  interview: `You are an expert software engineer helping in a technical interview.
Provide: 1) Strategy in 2-3 sentences, 2) Clean working code with comments, 3) Time and space complexity.
Use clear section headers. Be concise but thorough.`,

  screen: `You are ClueMind, an expert AI assistant looking at the user's screen. Your PRIMARY job is to DIRECTLY ANSWER any questions, problems, quizzes, or tasks visible on screen.

RULES:
- If you see a question or quiz: Give the CORRECT ANSWER immediately and clearly. State which option is correct and WHY.
- If you see code: Review it, find bugs, suggest fixes, and provide corrected code.
- If you see a coding problem: Solve it completely with working code.
- If you see a multiple-choice test: Identify EVERY question visible and provide the correct answer for each one.
- If you see an interview question: Provide the best answer.
- If you see an error message: Explain the cause and give the fix.
- If you see a form or task: Help complete it.

FORMAT your response as:
## Answers
(Direct answers to every question/problem visible)

## Explanation
(Brief reasoning for each answer)

Do NOT just describe what is on screen. SOLVE what is on screen. Be direct, confident, and accurate.`
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

/**
 * Make a request to the Gemini API with retry logic
 * @param {string} apiKey - Gemini API key
 * @param {object} body - Request body
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<object>} API response data
 */
async function geminiRequest(apiKey, body, retries = 3) {
  const url = `${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`

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

      const data = await response.json()
      return data
    } catch (err) {
      if (attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
}

/**
 * Get AI suggestion based on transcript and mode
 * @param {string} transcript - Recent transcript text
 * @param {string} mode - Current mode (meeting/interview/screen)
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{suggestion: string, code: string|null, type: string, confidence: number}>}
 */
async function getAISuggestion(transcript, mode, apiKey) {
  if (!transcript || !transcript.trim()) return null

  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.meeting
  const prompt = `${systemPrompt}\n\nTranscript:\n${transcript}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  }

  const data = await geminiRequest(apiKey, body)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Extract code blocks if present
  const codeMatch = text.match(/```[\s\S]*?```/g)
  const code = codeMatch ? codeMatch.map(c => c.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()).join('\n\n') : null

  return {
    suggestion: text,
    code,
    type: mode,
    confidence: 0.85
  }
}

/**
 * Analyze a screen capture using Gemini Vision
 * @param {string} base64Image - Base64-encoded JPEG image
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{suggestion: string, code: string|null, type: string, confidence: number}>}
 */
async function analyzeScreen(base64Image, apiKey) {
  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: base64Image
          }
        },
        {
          text: SYSTEM_PROMPTS.screen
        }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  }

  const data = await geminiRequest(apiKey, body)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  const codeMatch = text.match(/```[\s\S]*?```/g)
  const code = codeMatch ? codeMatch.map(c => c.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()).join('\n\n') : null

  return {
    suggestion: text,
    code,
    type: 'screen-analysis',
    confidence: 0.9
  }
}

/**
 * Detect if text contains a coding question
 * @param {string} text - Text to analyze
 * @returns {Promise<{isCodingQuestion: boolean, keywords: string[]}>}
 */
async function detectCodingQuestion(text) {
  if (!text) return { isCodingQuestion: false, keywords: [] }

  const lowerText = text.toLowerCase()
  const foundKeywords = CODING_KEYWORDS.filter(kw => lowerText.includes(kw))

  return {
    isCodingQuestion: foundKeywords.length >= 1,
    keywords: foundKeywords
  }
}

/**
 * Get interview help for a coding question
 * @param {string} question - The coding question or problem
 * @param {string} language - Preferred programming language
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{suggestion: string, code: string|null, type: string, confidence: number}>}
 */
async function getInterviewHelp(question, language, apiKey) {
  const prompt = `${SYSTEM_PROMPTS.interview}

Preferred language: ${language}

Problem/Question:
${question}

Provide your response with these sections:
## Strategy
(2-3 sentences explaining the approach)

## Solution
(Clean, working code in ${language} with comments)

## Complexity
- Time: O(?)
- Space: O(?)`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  }

  const data = await geminiRequest(apiKey, body)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  const codeMatch = text.match(/```[\s\S]*?```/g)
  const code = codeMatch ? codeMatch.map(c => c.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()).join('\n\n') : null

  return {
    suggestion: text,
    code,
    type: 'interview-help',
    confidence: 0.9
  }
}

export { getAISuggestion, analyzeScreen, detectCodingQuestion, getInterviewHelp, askAboutScreen }

/**
 * Ask a follow-up question about a screen capture
 * @param {string} base64Image - Base64-encoded JPEG of the last screen capture
 * @param {string} question - User's question
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<{suggestion: string, code: string|null, type: string, confidence: number}>}
 */
async function askAboutScreen(base64Image, question, apiKey) {
  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: base64Image
          }
        },
        {
          text: `You are ClueMind, an expert AI assistant. The user is looking at a screen capture and has a question about it.

User question: ${question}

Provide a clear, direct, and helpful answer. If the question relates to code, include code snippets. If it's about text on screen, quote the relevant parts. Be concise but thorough.`
        }
      ]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  }

  const data = await geminiRequest(apiKey, body)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  const codeMatch = text.match(/```[\s\S]*?```/g)
  const code = codeMatch ? codeMatch.map(c => c.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()).join('\n\n') : null

  return {
    suggestion: text,
    code,
    type: 'chat-answer',
    confidence: 0.9
  }
}
