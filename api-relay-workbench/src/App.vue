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
import { useApiTesting } from './composables/useApiTesting'
import { useChatSession } from './composables/useChatSession'
import { useImageGeneration } from './composables/useImageGeneration'
import { useRelayBenchmark } from './composables/useRelayBenchmark'
import { useRelayManagement } from './composables/useRelayManagement'
import type { AppState } from './lib/types'
import { prettyJson } from './lib/format'
import { clearState, loadState, saveState } from './lib/storage'
import { buildImageGenerationBody } from './lib/openaiClient'

const state = reactive<AppState>(loadState())
const activeTab = ref('config')
let saveStateTimer: number | undefined

const {
  activeRelay,
  selectedRelay,
  selectedRelayId,
  fetchingRelayModels,
  addRelayEndpoint,
  removeRelayEndpoint,
  useRelayEndpoint,
  fetchRelayModels,
} = useRelayManagement(state)

const activeApiConfig = computed(() => ({
  ...state.config,
  baseUrl: activeRelay.value?.baseUrl ?? '',
  apiKey: activeRelay.value?.apiKey ?? '',
  model: activeRelay.value?.model ?? '',
}))

const imageApiConfig = computed(() => ({
  baseUrl: state.imageConfig.baseUrl,
  apiKey: state.imageConfig.apiKey,
  requestTransport: state.config.requestTransport,
}))

const {
  testingModels,
  testingChat,
  modelsResult,
  chatTestResult,
  lastRequestBody,
  activeCompletionEndpoint,
  requestTransportLabel,
  activeCompletionRequestUrl,
  previewRequestBody,
  testerRequestBody,
  testModels,
  testChat,
  copyCurl,
} = useApiTesting(state, activeTab, activeApiConfig, copyText)

const {
  sendingChat,
  userInput,
  sendMessage,
  clearMessages,
} = useChatSession(state, activeTab, activeApiConfig, activeCompletionEndpoint, (body) => {
  lastRequestBody.value = body
})

const imageGenerationRequestUrl = computed(() => {
  const baseUrl = state.imageConfig.baseUrl.replace(/\/+$/, '')
  if (state.config.requestTransport === 'local_proxy') {
    const params = new URLSearchParams({ baseUrl })
    return `/api/openai-proxy/images/generations?${params.toString()}`
  }

  return `${baseUrl}/images/generations`
})

const {
  benchmarkRunning,
  benchmarkMode,
  benchmarkPrompt,
  benchmarkTimeoutMs,
  benchmarkRunCount,
  sortedBenchmarkResults,
  runBenchmark,
  clearBenchmarkResults,
} = useRelayBenchmark(state, activeTab)

const {
  generatingImages,
  imageResult,
  imageItems,
  imageGenerationDurationMs,
  generateImage,
} = useImageGeneration(state, activeTab, imageApiConfig, (body) => {
  lastRequestBody.value = body
})

watch(
  state,
  () => {
    if (saveStateTimer) {
      window.clearTimeout(saveStateTimer)
    }

    saveStateTimer = window.setTimeout(() => {
      saveState(state)
    }, 200)
  },
  { deep: true },
)

const visibleMessages = computed(() =>
  state.messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
)

const imageRequestBody = computed(() => buildImageGenerationBody(state.imageConfig))

const maskedKey = computed(() => {
  const key = activeApiConfig.value.apiKey.trim()
  if (!key) return '未填写'
  if (key.length <= 10) return '已填写'
  return `${key.slice(0, 6)}...${key.slice(-4)}`
})

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
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
  clearBenchmarkResults()
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
