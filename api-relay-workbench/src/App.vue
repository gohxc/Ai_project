<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ChatDotRound,
  Connection,
  Delete,
  DocumentCopy,
  FolderChecked,
  Monitor,
  Plus,
  Promotion,
  Refresh,
  Setting,
  Stopwatch,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { AppState, ChatMessage, RelayBenchmarkResult, RelayEndpoint, RequestHistoryItem } from './lib/types'
import { addHistory, clearState, createId, loadState, saveState } from './lib/storage'
import {
  buildChatBody,
  buildResponsesBody,
  createChatCompletion,
  createResponse,
  extractAssistantText,
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
  state.messages = fresh.messages
  state.history = fresh.history
  modelsResult.value = null
  chatTestResult.value = null
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
        <el-menu-item index="history">
          <el-icon><FolderChecked /></el-icon>
          <span>请求历史</span>
        </el-menu-item>
      </el-menu>

      <div class="storage-note">
        <strong>数据保存</strong>
        <span>当前版本保存到本机浏览器 localStorage。API Key 不会上传到额外服务器。</span>
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
        <section v-show="activeTab === 'config'" class="panel">
          <div class="section-head">
            <div>
              <h2>当前会话设置</h2>
              <p>地址、Key 和模型在中转管理维护；这里选择当前中转站和本次会话参数。</p>
            </div>
          </div>

          <el-form label-position="top" class="config-form">
            <el-form-item label="当前中转站">
              <el-select v-model="state.config.activeRelayId" placeholder="请选择中转站" filterable>
                <el-option
                  v-for="endpoint in state.relayEndpoints"
                  :key="endpoint.id"
                  :label="`${endpoint.name} · ${endpoint.model || '未配置模型'}`"
                  :value="endpoint.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="接口模式">
              <el-radio-group v-model="state.config.apiMode">
                <el-radio-button label="chat_completions">Chat Completions</el-radio-button>
                <el-radio-button label="responses">Responses API</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="请求通道">
              <el-segmented
                v-model="state.config.requestTransport"
                :options="[
                  { label: '浏览器直连', value: 'direct' },
                  { label: '本地代理', value: 'local_proxy' },
                ]"
              />
              <p class="field-hint">
                本地代理通过 Vite dev server 转发请求，可避开部分中转站拒绝浏览器 OPTIONS 预检的问题。
              </p>
            </el-form-item>

            <div class="form-grid">
              <el-form-item label="当前 Base URL">
                <el-input :model-value="activeApiConfig.baseUrl" readonly placeholder="未配置" />
              </el-form-item>
              <el-form-item label="当前模型">
                <el-input :model-value="activeApiConfig.model" readonly placeholder="未配置" />
              </el-form-item>
            </div>

            <el-form-item label="Temperature">
              <el-slider v-model="state.config.temperature" :min="0" :max="2" :step="0.1" show-input />
            </el-form-item>

            <el-form-item label="系统提示词">
              <el-input v-model="state.config.systemPrompt" type="textarea" :rows="4" />
            </el-form-item>
          </el-form>
        </section>

        <section v-show="activeTab === 'tester'" class="panel tester-grid">
          <div class="test-actions">
            <div class="section-head compact">
              <div>
                <h2>接口测试</h2>
                <p>先测模型列表，再按当前接口模式测试生成接口。</p>
              </div>
            </div>

            <el-radio-group v-model="state.config.apiMode" class="tester-mode">
              <el-radio-button label="chat_completions">Chat Completions</el-radio-button>
              <el-radio-button label="responses">Responses API</el-radio-button>
            </el-radio-group>

            <el-tag type="info" class="endpoint-tag">{{ activeCompletionEndpoint }}</el-tag>
            <el-tag
              :type="state.config.requestTransport === 'local_proxy' ? 'warning' : 'info'"
              class="endpoint-tag"
            >
              {{ requestTransportLabel }}
            </el-tag>
            <p v-if="state.config.requestTransport === 'local_proxy'" class="proxy-note">
              代理只在本地开发服务 http://127.0.0.1:5174 下可用，请求会从本机转发到当前中转站。
            </p>

            <el-button type="primary" :icon="Connection" :loading="testingModels" @click="testModels">
              测试 /models
            </el-button>
            <el-button type="success" :icon="Promotion" :loading="testingChat" @click="testChat">
              测试 {{ activeCompletionEndpoint }}
            </el-button>
            <el-button :icon="DocumentCopy" @click="copyCurl">复制 curl</el-button>
          </div>

          <div class="debug-panels">
            <div class="debug-box">
              <div class="debug-title">
                <strong>{{ activeCompletionEndpoint }} 请求预览</strong>
                <el-button link :icon="DocumentCopy" @click="copyText(prettyJson(testerRequestBody))">复制</el-button>
              </div>
              <div class="request-url">{{ activeCompletionRequestUrl }}</div>
              <pre>{{ prettyJson(testerRequestBody) }}</pre>
            </div>

            <div class="debug-box">
              <div class="debug-title">
                <strong>/models 响应</strong>
                <el-button link :icon="DocumentCopy" @click="copyText(prettyJson(modelsResult))">复制</el-button>
              </div>
              <pre>{{ prettyJson(modelsResult) || '暂无测试结果' }}</pre>
            </div>

            <div class="debug-box wide">
              <div class="debug-title">
                <strong>{{ activeCompletionEndpoint }} 响应</strong>
                <el-button link :icon="DocumentCopy" @click="copyText(prettyJson(chatTestResult))">复制</el-button>
              </div>
              <pre>{{ prettyJson(chatTestResult) || '暂无测试结果' }}</pre>
            </div>
          </div>
        </section>

        <section v-show="activeTab === 'relays'" class="panel relays-panel">
          <div class="section-head">
            <div>
              <h2>中转管理</h2>
              <p>统一保存每个中转站的地址、Key 和模型；测试、聊天和测速都可以直接复用。</p>
            </div>
            <el-button type="primary" :icon="Plus" @click="addRelayEndpoint">添加中转站</el-button>
          </div>

          <div class="relay-management-layout">
            <aside class="relay-list-panel">
              <div class="relay-list" role="list" aria-label="中转站列表">
                <button
                  v-for="endpoint in state.relayEndpoints"
                  :key="endpoint.id"
                  type="button"
                  class="relay-list-item"
                  :class="{ active: endpoint.id === selectedRelay?.id }"
                  @click="selectedRelayId = endpoint.id"
                >
                  <div class="relay-list-item-head">
                    <strong>{{ endpoint.name }}</strong>
                    <el-tag v-if="endpoint.id === state.config.activeRelayId" size="small" type="success">当前</el-tag>
                    <el-tag v-else-if="endpoint.enabled" size="small">启用</el-tag>
                    <el-tag v-else size="small" type="info">停用</el-tag>
                  </div>
                  <span class="relay-list-item-url">{{ endpoint.baseUrl || '未填写 Base URL' }}</span>
                  <span class="relay-list-item-model">{{ endpoint.model || '未配置模型' }}</span>
                </button>
              </div>
            </aside>

            <section class="relay-settings" v-if="selectedRelay">
              <div class="section-head compact">
                <div>
                  <h2>{{ selectedRelay.name || '未命名中转站' }}</h2>
                  <p>编辑左侧选中的中转站设置，点击“设为当前”会切换测试、聊天和测速实际使用的中转站。</p>
                </div>
                <div class="section-actions">
                  <el-button :icon="Connection" @click="useRelayEndpoint(selectedRelay)">设为当前</el-button>
                  <el-button
                    :icon="Delete"
                    :disabled="state.relayEndpoints.length <= 1"
                    @click="removeRelayEndpoint(selectedRelay.id)"
                  />
                </div>
              </div>

              <el-form label-position="top">
                <div class="relay-settings-head">
                  <el-switch v-model="selectedRelay.enabled" active-text="启用" inactive-text="停用" />
                  <el-tag v-if="selectedRelay.id === state.config.activeRelayId" type="success">当前使用</el-tag>
                  <el-tag v-else type="info">仅编辑</el-tag>
                </div>

                <div class="relay-form-grid">
                  <el-form-item label="名称">
                    <el-input v-model="selectedRelay.name" placeholder="例如：中转站 A" />
                  </el-form-item>
                  <el-form-item label="模型">
                    <div class="model-picker">
                      <el-select
                        v-model="selectedRelay.model"
                        allow-create
                        filterable
                        default-first-option
                        placeholder="先获取模型，或手动输入"
                      >
                        <el-option
                          v-for="model in selectedRelay.models"
                          :key="model"
                          :label="model"
                          :value="model"
                        />
                      </el-select>
                      <el-button
                        :icon="Refresh"
                        :loading="fetchingRelayModels[selectedRelay.id]"
                        @click="fetchRelayModels(selectedRelay)"
                      >
                        获取模型
                      </el-button>
                    </div>
                  </el-form-item>
                </div>

                <el-form-item label="API Base URL">
                  <el-input v-model="selectedRelay.baseUrl" placeholder="https://example.com/v1" />
                </el-form-item>

                <el-form-item label="API Key">
                  <el-input
                    v-model="selectedRelay.apiKey"
                    type="password"
                    placeholder="sk-..."
                    show-password
                  />
                </el-form-item>

                <el-form-item label="备注">
                  <el-input v-model="selectedRelay.note" placeholder="套餐、来源、限制等" />
                </el-form-item>

                <div class="relay-meta">
                  <el-tag v-if="selectedRelay.models.length > 0" type="success">{{ selectedRelay.models.length }} 个模型</el-tag>
                  <el-tag v-else type="info">未获取模型</el-tag>
                  <span v-if="selectedRelay.modelsFetchedAt">
                    {{ new Date(selectedRelay.modelsFetchedAt).toLocaleString() }}
                  </span>
                </div>
              </el-form>
            </section>
          </div>
        </section>


        <section v-show="activeTab === 'benchmark'" class="panel benchmark-panel">
          <div class="section-head">
            <div>
              <h2>中转测速</h2>
              <p>直接使用“中转管理”里已启用的档案；连通性测试不需要 Key，真实速度测试使用档案自己的 Key 和模型。</p>
            </div>
            <div class="section-actions">
              <el-button :icon="Setting" @click="activeTab = 'relays'">管理中转站</el-button>
              <el-button type="primary" :icon="Stopwatch" :loading="benchmarkRunning" @click="runBenchmark">
                开始测速
              </el-button>
            </div>
          </div>

          <div class="benchmark-options">
            <el-form label-position="top">
              <el-form-item label="测试模式">
                <el-radio-group v-model="benchmarkMode">
                  <el-radio-button label="connectivity">连通性测试</el-radio-button>
                  <el-radio-button label="real">真实速度测试</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <div class="form-grid">
                <el-form-item label="测速提示词">
                  <el-input
                    v-model="benchmarkPrompt"
                    placeholder="请只回复：pong"
                    :disabled="benchmarkMode === 'connectivity'"
                  />
                </el-form-item>
                <el-form-item label="单接口超时">
                  <el-input-number
                    v-model="benchmarkTimeoutMs"
                    :min="3000"
                    :max="120000"
                    :step="1000"
                    controls-position="right"
                  />
                </el-form-item>
                <el-form-item label="每个模型运行次数">
                  <el-input-number
                    v-model="benchmarkRunCount"
                    :min="1"
                    :max="20"
                    :step="1"
                    :disabled="benchmarkMode === 'connectivity'"
                    controls-position="right"
                  />
                </el-form-item>
              </div>
            </el-form>
          </div>

          <el-table
            :data="state.relayEndpoints"
            class="relay-source-table"
            empty-text="暂无中转站档案"
          >
            <el-table-column prop="enabled" label="启用" width="80">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="中转站" min-width="150" />
            <el-table-column prop="baseUrl" label="Base URL" min-width="260" show-overflow-tooltip />
            <el-table-column prop="model" label="模型" min-width="150" />
            <el-table-column label="Key" width="90">
              <template #default="{ row }">{{ row.apiKey ? '已保存' : '未填写' }}</template>
            </el-table-column>
          </el-table>

          <el-table :data="sortedBenchmarkResults" class="benchmark-table" empty-text="暂无测速结果">
            <el-table-column label="排名" width="80">
              <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="name" label="中转站" min-width="150" />
            <el-table-column prop="baseUrl" label="Base URL" min-width="260" show-overflow-tooltip />
            <el-table-column prop="model" label="模型" min-width="150" />
            <el-table-column prop="status" label="状态" width="120">
              <template #default="{ row }">
                <el-tag
                  :type="row.status === 'success' ? 'success' : row.status === 'error' ? 'danger' : 'warning'"
                >
                  {{
                    row.status === 'testing'
                      ? '测试中'
                      : row.status === 'success'
                        ? benchmarkMode === 'connectivity'
                          ? '可连接'
                          : '成功'
                        : row.status === 'error'
                          ? '失败'
                          : '等待'
                  }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="modelsMs" label="/models" width="110">
              <template #default="{ row }">{{ row.modelsMs ? `${row.modelsMs}ms` : '-' }}</template>
            </el-table-column>
            <el-table-column prop="statusCode" label="HTTP" width="90" />
            <el-table-column prop="successCount" label="次数" width="90">
              <template #default="{ row }">
                {{ row.runCount ? `${row.successCount ?? 0}/${row.runCount}` : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="minMs" label="最小" width="100" sortable>
              <template #default="{ row }">{{ row.minMs ? `${row.minMs}ms` : '-' }}</template>
            </el-table-column>
            <el-table-column prop="avgMs" label="平均" width="100" sortable>
              <template #default="{ row }">{{ row.avgMs ? `${row.avgMs}ms` : '-' }}</template>
            </el-table-column>
            <el-table-column prop="maxMs" label="最大" width="100" sortable>
              <template #default="{ row }">{{ row.maxMs ? `${row.maxMs}ms` : '-' }}</template>
            </el-table-column>
            <el-table-column prop="error" label="错误" min-width="220" show-overflow-tooltip />
          </el-table>
        </section>

        <section v-show="activeTab === 'chat'" class="chat-layout">
          <div class="chat-panel">
            <div class="section-head compact">
              <div>
                <h2>聊天测试</h2>
                <p>{{ state.config.stream ? '当前使用流式输出' : '当前使用普通响应' }}</p>
              </div>
              <el-button :icon="Delete" @click="clearMessages">清空会话</el-button>
            </div>

            <div class="messages">
              <el-empty v-if="visibleMessages.length === 0" description="暂无消息" />
              <div
                v-for="message in visibleMessages"
                :key="message.id"
                class="message"
                :class="`message-${message.role}`"
              >
                <span>{{ message.role === 'user' ? '用户' : '助手' }}</span>
                <p>{{ message.content || '...' }}</p>
              </div>
            </div>

            <div class="composer">
              <el-input
                v-model="userInput"
                type="textarea"
                :rows="4"
                resize="none"
                placeholder="输入一条消息，Ctrl + Enter 发送"
                @keydown.ctrl.enter.prevent="sendMessage"
              />
              <el-button type="primary" :icon="Promotion" :loading="sendingChat" @click="sendMessage">
                发送
              </el-button>
            </div>
          </div>

          <div class="debug-box side-debug">
            <div class="debug-title">
              <strong>最近请求</strong>
              <el-button link :icon="DocumentCopy" @click="copyText(prettyJson(lastRequestBody || previewRequestBody))">
                复制
              </el-button>
            </div>
            <pre>{{ prettyJson(lastRequestBody || previewRequestBody) }}</pre>
          </div>
        </section>

        <section v-show="activeTab === 'history'" class="panel">
          <div class="section-head">
            <div>
              <h2>请求历史</h2>
              <p>最多保存最近 50 条，只保存在当前浏览器。</p>
            </div>
            <el-button :icon="Delete" @click="clearHistory">清空历史</el-button>
          </div>

          <el-table :data="state.history" height="590" empty-text="暂无请求历史">
            <el-table-column prop="type" label="类型" width="110">
              <template #default="{ row }">
                <el-tag :type="row.type === 'models' ? 'info' : 'success'">{{ row.type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="endpoint" label="接口" min-width="170" />
            <el-table-column prop="model" label="模型" min-width="150" />
            <el-table-column prop="status" label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : 'danger'">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="statusCode" label="HTTP" width="90" />
            <el-table-column prop="durationMs" label="耗时" width="100">
              <template #default="{ row }">{{ row.durationMs }}ms</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" min-width="190">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
            </el-table-column>
          </el-table>
        </section>
      </el-main>
    </el-container>
  </el-container>
</template>
