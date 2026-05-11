<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ChatDotRound,
  Connection,
  FolderChecked,
  Monitor,
  Picture,
  Refresh,
  Setting,
  Stopwatch,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import ApiTesting from './components/ApiTesting.vue'
import ChatTesting from './components/ChatTesting.vue'
import ImageGeneration from './components/ImageGeneration.vue'
import RelayBenchmark from './components/RelayBenchmark.vue'
import RelayManagement from './components/RelayManagement.vue'
import RequestHistory from './components/RequestHistory.vue'
import SessionSettings from './components/SessionSettings.vue'
import type { AppState, ChatMessage, RelayBenchmarkResult, RelayEndpoint, RequestHistoryItem } from './lib/types'
import { addHistory, clearState, createId, loadState, saveState } from './lib/storage'
import {
  buildImageGenerationBody,
  buildChatBody,
  buildResponsesBody,
  createChatCompletion,
  createImageGeneration,
  createResponse,
  extractAssistantText,
  extractGeneratedImages,
  extractResponseText,
  listModels,
  streamResponse,
  streamChatCompletion,
} from './lib/openaiClient'

interface BenchmarkRequestResult {
  ok: boolean
  statusCode?: number
  durationMs: number
  data?: unknown
  error?: string
  requestBody?: unknown
}

const state = reactive<AppState>(loadState())
const activeTab = ref('config')
const testingModels = ref(false)
const testingChat = ref(false)
const sendingChat = ref(false)
const userInput = ref('')
const modelsResult = ref<unknown>(null)
const chatTestResult = ref<unknown>(null)
const lastRequestBody = ref<unknown>(null)
const benchmarkRunning = ref(false)
const benchmarkResults = ref<RelayBenchmarkResult[]>([])
const benchmarkMode = ref<'connectivity' | 'real'>('connectivity')
const benchmarkPrompt = ref('请只回复：pong')
const benchmarkTimeoutMs = ref(30_000)
const benchmarkRunCount = ref(5)
const fetchingRelayModels = ref<Record<string, boolean>>({})
const selectedRelayId = ref(state.config.activeRelayId || state.relayEndpoints[0]?.id || '')
const generatingImages = ref(false)
const imageResult = ref<unknown>(null)
const imageItems = ref<Array<{ url: string; revisedPrompt: string }>>([])
const imageGenerationDurationMs = ref<number | null>(null)

watch(
  state,
  () => {
    saveState(state)
  },
  { deep: true },
)

watch(
  () => [state.relayEndpoints, state.config.activeRelayId] as const,
  () => {
    if (selectedRelayId.value && state.relayEndpoints.some((endpoint) => endpoint.id === selectedRelayId.value)) {
      return
    }

    selectedRelayId.value = state.config.activeRelayId || state.relayEndpoints[0]?.id || ''
  },
  { deep: true, immediate: true },
)

const visibleMessages = computed(() =>
  state.messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
)

const activeRelay = computed(() => {
  const selected = state.relayEndpoints.find((endpoint) => endpoint.id === state.config.activeRelayId)
  return selected ?? state.relayEndpoints[0]
})

const selectedRelay = computed(() => {
  const selected = state.relayEndpoints.find((endpoint) => endpoint.id === selectedRelayId.value)
  return selected ?? activeRelay.value ?? state.relayEndpoints[0]
})

const activeApiConfig = computed(() => ({
  ...state.config,
  baseUrl: activeRelay.value?.baseUrl ?? '',
  apiKey: activeRelay.value?.apiKey ?? '',
  model: activeRelay.value?.model ?? '',
}))

const activeCompletionEndpoint = computed(() =>
  state.config.apiMode === 'responses' ? '/responses' : '/chat/completions',
)

const requestTransportLabel = computed(() =>
  state.config.requestTransport === 'local_proxy' ? '本地代理' : '浏览器直连',
)

const proxyBaseUrlParam = computed(() => encodeURIComponent(activeApiConfig.value.baseUrl.replace(/\/+$/, '')))

const activeCompletionRequestUrl = computed(() => {
  const baseUrl = activeApiConfig.value.baseUrl.replace(/\/+$/, '')
  if (state.config.requestTransport === 'local_proxy') {
    return `/api/openai-proxy${activeCompletionEndpoint.value}?baseUrl=${proxyBaseUrlParam.value}`
  }

  return `${baseUrl}${activeCompletionEndpoint.value}`
})

const imageApiConfig = computed(() => ({
  baseUrl: state.imageConfig.baseUrl,
  apiKey: state.imageConfig.apiKey,
  requestTransport: state.config.requestTransport,
}))

const imageGenerationRequestUrl = computed(() => {
  const baseUrl = state.imageConfig.baseUrl.replace(/\/+$/, '')
  if (state.config.requestTransport === 'local_proxy') {
    const params = new URLSearchParams({ baseUrl })
    return `/api/openai-proxy/images/generations?${params.toString()}`
  }

  return `${baseUrl}/images/generations`
})

const testerMessage = computed<ChatMessage>(() => ({
  id: 'tester_preview',
  role: 'user',
  content: '请只回复：pong',
  createdAt: new Date().toISOString(),
}))

const previewRequestBody = computed(() =>
  state.config.apiMode === 'responses'
    ? buildResponsesBody(activeApiConfig.value, state.messages, state.config.stream)
    : buildChatBody(activeApiConfig.value, state.messages, state.config.stream),
)

const testerRequestBody = computed(() =>
  state.config.apiMode === 'responses'
      ? buildResponsesBody(activeApiConfig.value, [testerMessage.value], state.config.stream)
      : buildChatBody(activeApiConfig.value, [testerMessage.value], state.config.stream),
)

const imageRequestBody = computed(() => buildImageGenerationBody(state.imageConfig))

const sortedBenchmarkResults = computed(() =>
  [...benchmarkResults.value].sort((a, b) => {
    if (a.status === 'success' && b.status !== 'success') return -1
    if (a.status !== 'success' && b.status === 'success') return 1
    return (
      (a.avgMs ?? a.totalMs ?? Number.MAX_SAFE_INTEGER) -
      (b.avgMs ?? b.totalMs ?? Number.MAX_SAFE_INTEGER)
    )
  }),
)

const maskedKey = computed(() => {
  const key = activeApiConfig.value.apiKey.trim()
  if (!key) return '未填写'
  if (key.length <= 10) return '已填写'
  return `${key.slice(0, 6)}...${key.slice(-4)}`
})

function recordHistory(item: Omit<RequestHistoryItem, 'id' | 'createdAt'>) {
  addHistory(state, {
    ...item,
    id: createId('hist'),
    createdAt: new Date().toISOString(),
  })
}

function prettyJson(value: unknown) {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function extractModelIds(value: unknown) {
  if (!value || typeof value !== 'object') return []

  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data)) return []

  return data
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        return (item as { id: string }).id
      }
      return ''
    })
    .filter((model) => model.trim())
}

function validateConfig() {
  if (!activeRelay.value) {
    ElMessage.error('请先添加一个中转站')
    activeTab.value = 'relays'
    return false
  }

  if (!activeApiConfig.value.baseUrl.trim()) {
    ElMessage.error('当前中转站缺少 API Base URL')
    activeTab.value = 'relays'
    return false
  }

  if (!activeApiConfig.value.model.trim()) {
    ElMessage.error('当前中转站缺少模型名称')
    activeTab.value = 'relays'
    return false
  }

  return true
}

function validateImageConfig() {
  if (!state.imageConfig.baseUrl.trim()) {
    ElMessage.error('请填写图片生成 API Base URL')
    activeTab.value = 'images'
    return false
  }

  if (!state.imageConfig.apiKey.trim()) {
    ElMessage.error('请填写图片生成 API Key')
    activeTab.value = 'images'
    return false
  }

  if (!state.imageConfig.model.trim()) {
    ElMessage.error('请填写图片模型名称')
    return false
  }

  if (!state.imageConfig.prompt.trim()) {
    ElMessage.error('请填写图片提示词')
    return false
  }

  return true
}
function benchmarkSourceEndpoints() {
  return state.relayEndpoints.filter((endpoint) => endpoint.enabled && endpoint.baseUrl.trim())
}

function realBenchmarkIssues(endpoint: RelayEndpoint) {
  return [
    !endpoint.apiKey.trim() ? '缺少 API Key' : '',
    !endpoint.model.trim() ? '缺少模型名称' : '',
  ].filter(Boolean)
}

function canRunRealBenchmark(endpoint: RelayEndpoint) {
  return realBenchmarkIssues(endpoint).length === 0
}

function validateBenchmarkConfig() {
  const usableEndpoints = benchmarkSourceEndpoints()
  if (usableEndpoints.length === 0) {
    ElMessage.error('请至少启用一个中转站档案')
    activeTab.value = 'relays'
    return false
  }

  if (benchmarkMode.value === 'real') {
    const runnableEndpoints = usableEndpoints.filter(canRunRealBenchmark)
    if (runnableEndpoints.length === 0) {
      ElMessage.error('真实速度测试至少需要一个已填写 Key 和模型的中转站')
      activeTab.value = 'relays'
      return false
    }
  }

  return true
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

async function copyCurl() {
  const requestUrl = activeCompletionRequestUrl.value.startsWith('/')
    ? `http://127.0.0.1:5174${activeCompletionRequestUrl.value}`
    : activeCompletionRequestUrl.value
  const curl = [
    `curl ${requestUrl}`,
    `  -H "Content-Type: application/json"`,
    `  -H "Authorization: Bearer ${activeApiConfig.value.apiKey || '<API_KEY>'}"`,
    `  -d '${JSON.stringify(testerRequestBody.value)}'`,
  ].join(' \\\n')

  await copyText(curl)
}

async function testModels() {
  if (!validateConfig()) return

  testingModels.value = true
  modelsResult.value = null
  const result = await listModels(activeApiConfig.value)
  modelsResult.value = result.data ?? result.error

  recordHistory({
    type: 'models',
    endpoint: '/models',
    status: result.ok ? 'success' : 'error',
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    responseBody: result.data,
    error: result.error,
  })

  ElMessage[result.ok ? 'success' : 'error'](result.ok ? '模型接口测试成功' : '模型接口测试失败')
  testingModels.value = false
}

function addRelayEndpoint() {
  const endpoint = {
    id: createId('relay'),
    name: `中转站 ${state.relayEndpoints.length + 1}`,
    baseUrl: '',
    apiKey: '',
    model: activeApiConfig.value.model || state.config.model,
    models: [],
    enabled: true,
    note: '',
  }
  state.relayEndpoints.push(endpoint)
  state.config.activeRelayId = endpoint.id
  selectedRelayId.value = endpoint.id
}

function removeRelayEndpoint(id: string) {
  const remaining = state.relayEndpoints.filter((endpoint) => endpoint.id !== id)
  state.relayEndpoints = remaining

  if (state.config.activeRelayId === id) {
    state.config.activeRelayId = remaining[0]?.id ?? ''
  }

  if (selectedRelayId.value === id) {
    selectedRelayId.value = state.config.activeRelayId || remaining[0]?.id || ''
  }
}

function useRelayEndpoint(endpoint: RelayEndpoint) {
  state.config.activeRelayId = endpoint.id
  selectedRelayId.value = endpoint.id
  ElMessage.success('已切换到该中转站')
}

async function fetchRelayModels(endpoint: RelayEndpoint) {
  if (!endpoint.baseUrl.trim()) {
    ElMessage.error('请先填写 API Base URL')
    return
  }

  fetchingRelayModels.value[endpoint.id] = true
  const result = await listModels({
    ...state.config,
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    model: endpoint.model || activeApiConfig.value.model,
  })

  fetchingRelayModels.value[endpoint.id] = false

  if (!result.ok) {
    ElMessage.error(result.error || '获取模型列表失败')
    return
  }

  const models = extractModelIds(result.data)
  endpoint.models = models
  endpoint.modelsFetchedAt = new Date().toISOString()

  if (models.length > 0) {
    if (!endpoint.model || !models.includes(endpoint.model)) {
      endpoint.model = models[0]
    }
    ElMessage.success(`已获取 ${models.length} 个模型`)
  } else {
    ElMessage.warning('接口返回成功，但没有识别到模型 ID，可继续手动输入')
  }
}

function buildBenchmarkConfig(endpoint: RelayEndpoint, apiKey: string) {
  return {
    ...state.config,
    baseUrl: endpoint.baseUrl.trim(),
    apiKey,
    model: endpoint.model,
    stream: false,
  }
}

async function benchmarkConnectivity(endpoint: RelayEndpoint): Promise<RelayBenchmarkResult> {
  const config = buildBenchmarkConfig(endpoint, '')
  const modelsResult = await listModels(config, { timeoutMs: benchmarkTimeoutMs.value })
  const canReachHttp = typeof modelsResult.statusCode === 'number'

  return {
    id: endpoint.id,
    name: endpoint.name,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    status: canReachHttp ? 'success' : 'error',
    modelsMs: modelsResult.durationMs,
    totalMs: modelsResult.durationMs,
    statusCode: modelsResult.statusCode,
    error: canReachHttp ? undefined : modelsResult.error,
    testedAt: new Date().toISOString(),
  }
}

async function runBenchmarkGeneration(endpoint: RelayEndpoint): Promise<BenchmarkRequestResult> {
  const config = buildBenchmarkConfig(endpoint, endpoint.apiKey)
  const testMessage: ChatMessage = {
    id: createId('msg'),
    role: 'user',
    content: benchmarkPrompt.value.trim() || '请只回复：pong',
    createdAt: new Date().toISOString(),
  }

  return state.config.apiMode === 'responses'
    ? await createResponse(config, [testMessage], { timeoutMs: benchmarkTimeoutMs.value })
    : await createChatCompletion(config, [testMessage], { timeoutMs: benchmarkTimeoutMs.value })
}

function summarizeBenchmarkRuns(
  endpoint: RelayEndpoint,
  results: BenchmarkRequestResult[],
  runCount: number,
  startedAt: number,
): RelayBenchmarkResult {
  const successfulResults = results.filter((result) => result.ok)
  const successfulDurations = successfulResults.map((result) => result.durationMs)
  const firstError = results.find((result) => !result.ok)
  const minMs = successfulDurations.length > 0 ? Math.min(...successfulDurations) : undefined
  const maxMs = successfulDurations.length > 0 ? Math.max(...successfulDurations) : undefined
  const avgMs =
    successfulDurations.length > 0
      ? Math.round(successfulDurations.reduce((sum, duration) => sum + duration, 0) / successfulDurations.length)
      : undefined

  if (successfulResults.length === 0) {
    return {
      id: endpoint.id,
      name: endpoint.name,
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      status: 'error',
      totalMs: Math.round(performance.now() - startedAt),
      runCount,
      successCount: 0,
      statusCode: firstError?.statusCode,
      error: firstError?.error || '全部测速请求失败',
      testedAt: new Date().toISOString(),
    }
  }

  return {
    id: endpoint.id,
    name: endpoint.name,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    status: 'success',
    chatMs: avgMs,
    totalMs: Math.round(performance.now() - startedAt),
    minMs,
    maxMs,
    avgMs,
    runCount,
    successCount: successfulResults.length,
    statusCode: firstError?.statusCode ?? successfulResults[0]?.statusCode,
    error: firstError ? `${successfulResults.length}/${runCount} 成功；${firstError.error || '部分测速请求失败'}` : undefined,
    testedAt: new Date().toISOString(),
  }
}

async function runRealBenchmark(endpoints: RelayEndpoint[]) {
  const runCount = Math.max(1, Math.round(benchmarkRunCount.value || 1))
  const startedAtByEndpoint = new Map(endpoints.map((endpoint) => [endpoint.id, performance.now()]))
  const resultsByEndpoint = new Map(endpoints.map((endpoint) => [endpoint.id, [] as BenchmarkRequestResult[]]))

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    const roundResults = await Promise.all(
      endpoints.map(async (endpoint) => ({
        endpoint,
        result: await runBenchmarkGeneration(endpoint),
      })),
    )

    for (const { endpoint, result } of roundResults) {
      const endpointResults = resultsByEndpoint.get(endpoint.id)
      endpointResults?.push(result)

      const index = benchmarkResults.value.findIndex((item) => item.id === endpoint.id)
      if (index >= 0 && endpointResults) {
        benchmarkResults.value[index] = summarizeBenchmarkRuns(
          endpoint,
          endpointResults,
          runCount,
          startedAtByEndpoint.get(endpoint.id) ?? performance.now(),
        )
      }
    }
  }

  for (const endpoint of endpoints) {
    const index = benchmarkResults.value.findIndex((result) => result.id === endpoint.id)
    if (index >= 0) {
      benchmarkResults.value[index] = summarizeBenchmarkRuns(
        endpoint,
        resultsByEndpoint.get(endpoint.id) ?? [],
        runCount,
        startedAtByEndpoint.get(endpoint.id) ?? performance.now(),
      )
    }
  }
}

async function runBenchmark() {
  if (!validateBenchmarkConfig()) return

  const endpoints = benchmarkSourceEndpoints()
  benchmarkRunning.value = true
  benchmarkResults.value = endpoints.map((endpoint) => {
    const issues = benchmarkMode.value === 'real' ? realBenchmarkIssues(endpoint) : []

    return {
      id: endpoint.id,
      name: endpoint.name,
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      status: issues.length > 0 ? 'error' : 'testing',
      error: issues.length > 0 ? issues.join('、') : undefined,
      testedAt: issues.length > 0 ? new Date().toISOString() : undefined,
    }
  })

  if (benchmarkMode.value === 'real') {
    await runRealBenchmark(endpoints.filter(canRunRealBenchmark))
  } else {
    const results = await Promise.all(endpoints.map((endpoint) => benchmarkConnectivity(endpoint)))
    for (const result of results) {
      const index = benchmarkResults.value.findIndex((item) => item.id === result.id)
      if (index >= 0) benchmarkResults.value[index] = result
    }
  }

  benchmarkRunning.value = false
  ElMessage.success('测速完成')
}

async function testChat() {
  if (!validateConfig()) return

  testingChat.value = true
  chatTestResult.value = null

  const testMessage: ChatMessage = {
    id: createId('msg'),
    role: 'user',
    content: '请只回复：pong',
    createdAt: new Date().toISOString(),
  }
  const result = state.config.stream
    ? state.config.apiMode === 'responses'
      ? await streamResponse(activeApiConfig.value, [testMessage], () => undefined)
      : await streamChatCompletion(activeApiConfig.value, [testMessage], () => undefined)
    : state.config.apiMode === 'responses'
      ? await createResponse(activeApiConfig.value, [testMessage])
      : await createChatCompletion(activeApiConfig.value, [testMessage])
  lastRequestBody.value = result.requestBody
  chatTestResult.value = result.data ?? result.error

  recordHistory({
    type: state.config.apiMode === 'responses' ? 'responses' : 'chat',
    endpoint: activeCompletionEndpoint.value,
    model: activeApiConfig.value.model,
    status: result.ok ? 'success' : 'error',
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    requestBody: result.requestBody,
    responseBody: result.data,
    error: result.error,
  })

  ElMessage[result.ok ? 'success' : 'error'](result.ok ? '生成接口测试成功' : '生成接口测试失败')
  testingChat.value = false
}

async function generateImage() {
  if (!validateImageConfig()) return

  generatingImages.value = true
  imageResult.value = null
  imageItems.value = []
  imageGenerationDurationMs.value = null

  const result = await createImageGeneration(imageApiConfig.value, state.imageConfig)
  imageResult.value = result.data ?? result.error
  imageItems.value = result.ok ? extractGeneratedImages(result.data, state.imageConfig.outputFormat) : []
  imageGenerationDurationMs.value = result.durationMs
  lastRequestBody.value = result.requestBody

  recordHistory({
    type: 'image',
    endpoint: '/images/generations',
    model: state.imageConfig.model,
    status: result.ok ? 'success' : 'error',
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    requestBody: result.requestBody,
    responseBody: result.data,
    error: result.error,
  })

  ElMessage[result.ok ? 'success' : 'error'](result.ok ? '图片生成成功' : '图片生成失败')
  generatingImages.value = false
}

async function sendMessage() {
  if (!validateConfig()) return

  const content = userInput.value.trim()
  if (!content) return

  const userMessage: ChatMessage = {
    id: createId('msg'),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage: ChatMessage = {
    id: createId('msg'),
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
  }
  const messagesForRequest = [...state.messages, userMessage]

  state.messages.push(userMessage, assistantMessage)
  userInput.value = ''
  sendingChat.value = true

  if (state.config.stream) {
    const result =
      state.config.apiMode === 'responses'
        ? await streamResponse(activeApiConfig.value, messagesForRequest, (token) => {
            assistantMessage.content += token
          })
        : await streamChatCompletion(activeApiConfig.value, messagesForRequest, (token) => {
            assistantMessage.content += token
          })
    lastRequestBody.value = result.requestBody

    if (!result.ok) {
      assistantMessage.content = result.error ?? '请求失败'
    }

    recordHistory({
      type: state.config.apiMode === 'responses' ? 'responses' : 'chat',
      endpoint: activeCompletionEndpoint.value,
      model: activeApiConfig.value.model,
      status: result.ok ? 'success' : 'error',
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      requestBody: result.requestBody,
      responseBody: result.data,
      error: result.error,
    })
  } else {
    const result =
      state.config.apiMode === 'responses'
        ? await createResponse(activeApiConfig.value, messagesForRequest)
        : await createChatCompletion(activeApiConfig.value, messagesForRequest)
    lastRequestBody.value = result.requestBody
    assistantMessage.content = result.ok
      ? (state.config.apiMode === 'responses'
          ? extractResponseText(result.data)
          : extractAssistantText(result.data)) || prettyJson(result.data)
      : result.error || '请求失败'

    recordHistory({
      type: state.config.apiMode === 'responses' ? 'responses' : 'chat',
      endpoint: activeCompletionEndpoint.value,
      model: activeApiConfig.value.model,
      status: result.ok ? 'success' : 'error',
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      requestBody: result.requestBody,
      responseBody: result.data,
      error: result.error,
    })
  }

  sendingChat.value = false
}

function clearMessages() {
  state.messages = []
  ElMessage.success('会话已清空')
}

function clearHistory() {
  state.history = []
  ElMessage.success('历史已清空')
}

function resetAll() {
  clearState()
  const fresh = loadState()
  state.config = fresh.config
  state.imageConfig = fresh.imageConfig
  state.messages = fresh.messages
  state.history = fresh.history
  modelsResult.value = null
  chatTestResult.value = null
  imageResult.value = null
  imageItems.value = []
  imageGenerationDurationMs.value = null
  lastRequestBody.value = null
  benchmarkResults.value = []
  ElMessage.success('本地数据已重置')
}
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="236px" class="sidebar">
      <div class="brand">
        <el-icon><Connection /></el-icon>
        <div>
          <strong>API 中转站</strong>
          <span>测试与聊天工作台</span>
        </div>
      </div>

      <el-menu v-model:default-active="activeTab" class="nav" @select="activeTab = $event">
        <el-menu-item index="config">
          <el-icon><Setting /></el-icon>
          <span>API 配置</span>
        </el-menu-item>
        <el-menu-item index="tester">
          <el-icon><Monitor /></el-icon>
          <span>接口测试</span>
        </el-menu-item>
        <el-menu-item index="relays">
          <el-icon><FolderChecked /></el-icon>
          <span>中转管理</span>
        </el-menu-item>
        <el-menu-item index="benchmark">
          <el-icon><Stopwatch /></el-icon>
          <span>中转测速</span>
        </el-menu-item>
        <el-menu-item index="chat">
          <el-icon><ChatDotRound /></el-icon>
          <span>聊天测试</span>
        </el-menu-item>
        <el-menu-item index="images">
          <el-icon><Picture /></el-icon>
          <span>图片生成</span>
        </el-menu-item>
        <el-menu-item index="history">
          <el-icon><FolderChecked /></el-icon>
          <span>请求历史</span>
        </el-menu-item>
      </el-menu>

      <div class="storage-note">
        <strong>数据保存</strong>
        <span>当前版本保存到本机浏览器 localStorage，API Key 不会上传到额外服务器。</span>
      </div>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div>
          <h1>API 中转测试台</h1>
          <p>
            {{ activeRelay?.name || '未选择中转站' }} ·
            {{ activeApiConfig.baseUrl || '未配置 Base URL' }} ·
            {{ activeApiConfig.model || '未配置模型' }}
          </p>
        </div>
        <div class="topbar-actions">
          <el-radio-group v-model="state.config.stream" class="response-mode-toggle" size="small">
            <el-radio-button :label="false">普通响应</el-radio-button>
            <el-radio-button :label="true">流式输出</el-radio-button>
          </el-radio-group>
          <el-tag type="info">Key: {{ maskedKey }}</el-tag>
          <el-button :icon="Refresh" @click="resetAll">重置本地数据</el-button>
        </div>
      </el-header>

      <el-main class="content">
        <SessionSettings
          v-if="activeTab === 'config'"
          v-model:config="state.config"
          :relay-endpoints="state.relayEndpoints"
          :active-api-config="activeApiConfig"
        />

        <ApiTesting
          v-if="activeTab === 'tester'"
          v-model:config="state.config"
          :active-completion-endpoint="activeCompletionEndpoint"
          :request-transport-label="requestTransportLabel"
          :active-completion-request-url="activeCompletionRequestUrl"
          :tester-request-body="testerRequestBody"
          :models-result="modelsResult"
          :chat-test-result="chatTestResult"
          :testing-models="testingModels"
          :testing-chat="testingChat"
          :test-models="testModels"
          :test-chat="testChat"
          :copy-curl="copyCurl"
          :copy-text="copyText"
          :pretty-json="prettyJson"
        />

        <RelayManagement
          v-if="activeTab === 'relays'"
          v-model:selected-relay-id="selectedRelayId"
          :relay-endpoints="state.relayEndpoints"
          :selected-relay="selectedRelay"
          :active-relay-id="state.config.activeRelayId"
          :fetching-relay-models="fetchingRelayModels"
          :on-add-relay="addRelayEndpoint"
          :on-remove-relay="removeRelayEndpoint"
          :on-use-relay="useRelayEndpoint"
          :on-fetch-relay-models="fetchRelayModels"
        />

        <RelayBenchmark
          v-if="activeTab === 'benchmark'"
          v-model:benchmark-mode="benchmarkMode"
          v-model:benchmark-prompt="benchmarkPrompt"
          v-model:benchmark-timeout-ms="benchmarkTimeoutMs"
          v-model:benchmark-run-count="benchmarkRunCount"
          :relay-endpoints="state.relayEndpoints"
          :sorted-benchmark-results="sortedBenchmarkResults"
          :benchmark-running="benchmarkRunning"
          :on-manage-relays="() => (activeTab = 'relays')"
          :on-run-benchmark="runBenchmark"
        />

        <ChatTesting
          v-if="activeTab === 'chat'"
          v-model:user-input="userInput"
          :config="state.config"
          :visible-messages="visibleMessages"
          :sending-chat="sendingChat"
          :last-request-body="lastRequestBody"
          :preview-request-body="previewRequestBody"
          :on-clear-messages="clearMessages"
          :on-send-message="sendMessage"
          :on-copy-text="copyText"
          :pretty-json="prettyJson"
        />

        <ImageGeneration
          v-if="activeTab === 'images'"
          v-model:image-config="state.imageConfig"
          :request-transport="state.config.requestTransport"
          :request-transport-label="requestTransportLabel"
          :generating-images="generatingImages"
          :image-generation-duration-ms="imageGenerationDurationMs"
          :image-result="imageResult"
          :image-items="imageItems"
          :image-request-body="imageRequestBody"
          :image-generation-request-url="imageGenerationRequestUrl"
          :on-generate-image="generateImage"
          :on-copy-text="copyText"
          :pretty-json="prettyJson"
        />

        <RequestHistory
          v-if="activeTab === 'history'"
          :history="state.history"
          :on-clear-history="clearHistory"
        />
      </el-main>
    </el-container>
  </el-container>
</template>
