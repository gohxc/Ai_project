import type { AppState, RequestHistoryItem } from './types'

const STORAGE_KEY = 'api-relay-workbench-state-v1'
const MAX_HISTORY = 50

export const defaultState: AppState = {
  config: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    activeRelayId: 'relay_default_openai',
    apiMode: 'chat_completions',
    requestTransport: 'direct',
    stream: true,
    temperature: 0.7,
    systemPrompt: '你是一个简洁、准确的助手。',
  },
  imageConfig: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-image-2',
    prompt: '一只坐在霓虹雨夜街头的柴犬，电影感，细节丰富',
    size: '1024x1024',
    quality: 'high',
    background: 'auto',
    outputFormat: 'png',
    imageCount: 1,
  },
  messages: [],
  history: [],
  relayEndpoints: [
    {
      id: 'relay_default_openai',
      name: 'OpenAI 官方',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4.1-mini',
      models: [],
      enabled: true,
      note: '',
    },
  ],
}

function normalizeRelayEndpoint(endpoint: Partial<AppState['relayEndpoints'][number]>) {
  return {
    id: endpoint.id || createId('relay'),
    name: endpoint.name || '未命名中转站',
    baseUrl: endpoint.baseUrl || '',
    apiKey: endpoint.apiKey || '',
    model: endpoint.model || defaultState.config.model,
    models: Array.isArray(endpoint.models) ? endpoint.models.filter((model): model is string => typeof model === 'string') : [],
    modelsFetchedAt: endpoint.modelsFetchedAt,
    enabled: typeof endpoint.enabled === 'boolean' ? endpoint.enabled : true,
    note: endpoint.note || '',
  }
}

function normalizeImageConfig(imageConfig: Partial<AppState['imageConfig']> | undefined) {
  return {
    ...defaultState.imageConfig,
    ...imageConfig,
    baseUrl: imageConfig?.baseUrl || defaultState.imageConfig.baseUrl,
    apiKey: imageConfig?.apiKey || defaultState.imageConfig.apiKey,
  }
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return structuredClone(defaultState)

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>
    const relayEndpoints = Array.isArray(parsed.relayEndpoints)
      ? parsed.relayEndpoints.map((endpoint) => normalizeRelayEndpoint(endpoint))
      : structuredClone(defaultState.relayEndpoints)
    const config = { ...defaultState.config, ...parsed.config }
    const imageConfig = normalizeImageConfig(parsed.imageConfig)

    if (!parsed.config?.activeRelayId && parsed.config?.baseUrl) {
      const legacyRelay = normalizeRelayEndpoint({
        id: 'relay_legacy_current',
        name: '历史当前配置',
        baseUrl: parsed.config.baseUrl,
        apiKey: parsed.config.apiKey,
        model: parsed.config.model,
        enabled: true,
      })
      const existingIndex = relayEndpoints.findIndex((endpoint) => endpoint.id === legacyRelay.id)
      if (existingIndex >= 0) {
        relayEndpoints[existingIndex] = legacyRelay
      } else {
        relayEndpoints.unshift(legacyRelay)
      }
      config.activeRelayId = legacyRelay.id
    } else if (!relayEndpoints.some((endpoint) => endpoint.id === config.activeRelayId)) {
      config.activeRelayId = relayEndpoints[0]?.id ?? defaultState.config.activeRelayId
    }

    if (config.requestTransport !== 'direct' && config.requestTransport !== 'local_proxy') {
      config.requestTransport = defaultState.config.requestTransport
    }

    return {
      config,
      imageConfig,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      relayEndpoints,
    }
  } catch {
    return structuredClone(defaultState)
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function addHistory(state: AppState, item: RequestHistoryItem) {
  state.history = [item, ...state.history].slice(0, MAX_HISTORY)
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}
