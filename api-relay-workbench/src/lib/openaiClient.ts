import type { ApiConfig, ChatMessage, ImageGenerationConfig } from './types'

export interface ApiResult<T = unknown> {
  ok: boolean
  statusCode?: number
  durationMs: number
  data?: T
  error?: string
}

export interface RequestOptions {
  timeoutMs?: number
}

export interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
}

export interface ResponseStreamEvent {
  type?: string
  delta?: string
}

export interface GeneratedImagePayloadItem {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

export interface ImageGenerationResponse {
  created?: number
  data?: GeneratedImagePayloadItem[]
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

function buildRequestUrl(config: Pick<ApiConfig, 'baseUrl' | 'requestTransport'>, path: string) {
  if (config.requestTransport === 'local_proxy') {
    const params = new URLSearchParams({ baseUrl: normalizeBaseUrl(config.baseUrl) })
    return `/api/openai-proxy${path}?${params.toString()}`
  }

  return `${normalizeBaseUrl(config.baseUrl)}${path}`
}

function headers(apiKey: string) {
  const result: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (apiKey.trim()) {
    result.Authorization = `Bearer ${apiKey.trim()}`
  }

  return result
}

function createSignal(timeoutMs?: number) {
  if (!timeoutMs) return undefined

  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), timeoutMs)
  return controller.signal
}

async function readJsonOrText(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function listModels(config: ApiConfig, options: RequestOptions = {}): Promise<ApiResult> {
  const startedAt = performance.now()

  try {
    const response = await fetch(buildRequestUrl(config, '/models'), {
      method: 'GET',
      headers: headers(config.apiKey),
      signal: createSignal(options.timeoutMs),
    })

    const data = await readJsonOrText(response)
    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data,
      error: response.ok ? undefined : stringifyError(data),
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function buildChatBody(config: ApiConfig, messages: ChatMessage[], stream: boolean) {
  const payloadMessages = [
    ...(config.systemPrompt.trim()
      ? [{ role: 'system' as const, content: config.systemPrompt.trim() }]
      : []),
    ...messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ]

  return {
    model: config.model,
    messages: payloadMessages,
    temperature: config.temperature,
    stream,
  }
}

export function buildResponsesBody(config: ApiConfig, messages: ChatMessage[], stream: boolean) {
  const input = [
    ...(config.systemPrompt.trim()
      ? [{ role: 'system' as const, content: config.systemPrompt.trim() }]
      : []),
    ...messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ]

  return {
    model: config.model,
    input,
    temperature: config.temperature,
    stream,
  }
}

export function buildImageGenerationBody(config: ImageGenerationConfig) {
  return {
    model: config.model,
    prompt: config.prompt,
    size: config.size,
    quality: config.quality,
    background: config.background,
    output_format: config.outputFormat,
    n: config.imageCount,
  }
}

export async function createChatCompletion(
  config: ApiConfig,
  messages: ChatMessage[],
  options: RequestOptions = {},
) {
  const startedAt = performance.now()
  const requestBody = buildChatBody(config, messages, false)

  try {
    const response = await fetch(buildRequestUrl(config, '/chat/completions'), {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(requestBody),
      signal: createSignal(options.timeoutMs),
    })
    const data = await readJsonOrText(response)

    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data,
      error: response.ok ? undefined : stringifyError(data),
      requestBody,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      requestBody,
    }
  }
}

export async function createResponse(config: ApiConfig, messages: ChatMessage[], options: RequestOptions = {}) {
  const startedAt = performance.now()
  const requestBody = buildResponsesBody(config, messages, false)

  try {
    const response = await fetch(buildRequestUrl(config, '/responses'), {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(requestBody),
      signal: createSignal(options.timeoutMs),
    })
    const data = await readJsonOrText(response)

    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data,
      error: response.ok ? undefined : stringifyError(data),
      requestBody,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      requestBody,
    }
  }
}

export async function createImageGeneration(
  config: Pick<ApiConfig, 'baseUrl' | 'apiKey' | 'requestTransport'>,
  imageConfig: ImageGenerationConfig,
  options: RequestOptions = {},
) {
  const startedAt = performance.now()
  const requestBody = buildImageGenerationBody(imageConfig)

  try {
    const response = await fetch(buildRequestUrl(config, '/images/generations'), {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(requestBody),
      signal: createSignal(options.timeoutMs),
    })
    const data = await readJsonOrText(response)

    return {
      ok: response.ok,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data,
      error: response.ok ? undefined : stringifyError(data),
      requestBody,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      requestBody,
    }
  }
}

export async function streamChatCompletion(
  config: ApiConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
) {
  const startedAt = performance.now()
  const requestBody = buildChatBody(config, messages, true)

  try {
    const response = await fetch(buildRequestUrl(config, '/chat/completions'), {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(requestBody),
    })

    if (!response.ok || !response.body) {
      const data = await readJsonOrText(response)
      return {
        ok: false,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        data,
        error: stringifyError(data),
        requestBody,
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const chunks: ChatCompletionChunk[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data) as ChatCompletionChunk
          chunks.push(parsed)
          const token = parsed.choices?.[0]?.delta?.content
          if (token) onToken(token)
        } catch {
          continue
        }
      }
    }

    return {
      ok: true,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data: chunks,
      requestBody,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      requestBody,
    }
  }
}

export async function streamResponse(
  config: ApiConfig,
  messages: ChatMessage[],
  onToken: (token: string) => void,
) {
  const startedAt = performance.now()
  const requestBody = buildResponsesBody(config, messages, true)

  try {
    const response = await fetch(buildRequestUrl(config, '/responses'), {
      method: 'POST',
      headers: headers(config.apiKey),
      body: JSON.stringify(requestBody),
    })

    if (!response.ok || !response.body) {
      const data = await readJsonOrText(response)
      return {
        ok: false,
        statusCode: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        data,
        error: stringifyError(data),
        requestBody,
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const events: ResponseStreamEvent[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data) as ResponseStreamEvent
          events.push(parsed)
          if (parsed.type === 'response.output_text.delta' && parsed.delta) {
            onToken(parsed.delta)
          }
        } catch {
          continue
        }
      }
    }

    return {
      ok: true,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      data: events,
      requestBody,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      requestBody,
    }
  }
}

export function extractAssistantText(data: unknown) {
  if (!data || typeof data !== 'object') return ''

  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''

  const first = choices[0] as { message?: { content?: unknown } } | undefined
  return typeof first?.message?.content === 'string' ? first.message.content : ''
}

export function extractResponseText(data: unknown) {
  if (!data || typeof data !== 'object') return ''

  const outputText = (data as { output_text?: unknown }).output_text
  if (typeof outputText === 'string') return outputText

  const output = (data as { output?: unknown }).output
  if (!Array.isArray(output)) return ''

  return output
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = (item as { content?: unknown }).content
      if (!Array.isArray(content)) return []
      return content.map((part) => {
        if (!part || typeof part !== 'object') return ''
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
    })
    .join('')
}

function imageMimeType(outputFormat: string) {
  switch (outputFormat) {
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

export function extractGeneratedImages(data: unknown, outputFormat: string) {
  if (!data || typeof data !== 'object') return []

  const items = (data as ImageGenerationResponse).data
  if (!Array.isArray(items)) return []

  const mimeType = imageMimeType(outputFormat)
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const image = item as GeneratedImagePayloadItem
      return {
        url: typeof image.url === 'string'
          ? image.url
          : typeof image.b64_json === 'string'
            ? `data:${mimeType};base64,${image.b64_json}`
            : '',
        revisedPrompt: typeof image.revised_prompt === 'string' ? image.revised_prompt : '',
      }
    })
    .filter((item): item is { url: string; revisedPrompt: string } => Boolean(item?.url))
}

function stringifyError(data: unknown) {
  if (!data) return '请求失败'
  if (typeof data === 'string') return data

  const maybeError = data as { error?: { message?: unknown }; message?: unknown }
  if (typeof maybeError.error?.message === 'string') return maybeError.error.message
  if (typeof maybeError.message === 'string') return maybeError.message

  return JSON.stringify(data)
}
