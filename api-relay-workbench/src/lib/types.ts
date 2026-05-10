export type StorageMode = 'localStorage'
export type ApiMode = 'chat_completions' | 'responses'
export type RequestTransport = 'direct' | 'local_proxy'

export interface ImageGenerationConfig {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  size: string
  quality: string
  background: string
  outputFormat: string
  imageCount: number
}

export interface ApiConfig {
  baseUrl: string
  apiKey: string
  model: string
  activeRelayId: string
  apiMode: ApiMode
  requestTransport: RequestTransport
  stream: boolean
  temperature: number
  systemPrompt: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface RequestHistoryItem {
  id: string
  type: 'models' | 'chat' | 'responses' | 'image'
  endpoint: string
  model?: string
  status: 'success' | 'error'
  statusCode?: number
  durationMs: number
  requestBody?: unknown
  responseBody?: unknown
  error?: string
  createdAt: string
}

export interface RelayEndpoint {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  models: string[]
  modelsFetchedAt?: string
  enabled: boolean
  note: string
}

export interface RelayBenchmarkResult {
  id: string
  name: string
  baseUrl: string
  model?: string
  status: 'pending' | 'testing' | 'success' | 'error'
  modelsMs?: number
  chatMs?: number
  totalMs?: number
  minMs?: number
  maxMs?: number
  avgMs?: number
  runCount?: number
  successCount?: number
  statusCode?: number
  error?: string
  testedAt?: string
}

export interface AppState {
  config: ApiConfig
  imageConfig: ImageGenerationConfig
  messages: ChatMessage[]
  history: RequestHistoryItem[]
  relayEndpoints: RelayEndpoint[]
}
