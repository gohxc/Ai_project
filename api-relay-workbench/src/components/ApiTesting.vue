<script setup lang="ts">
import { Connection, DocumentCopy, Promotion } from '@element-plus/icons-vue'
import type { AppState } from '../lib/types'

const config = defineModel<AppState['config']>('config', { required: true })

const props = defineProps<{
  activeCompletionEndpoint: string
  requestTransportLabel: string
  activeCompletionRequestUrl: string
  testerRequestBody: unknown
  modelsResult: unknown
  chatTestResult: unknown
  testingModels: boolean
  testingChat: boolean
  testModels: () => void | Promise<void>
  testChat: () => void | Promise<void>
  copyCurl: () => Promise<void> | void
  copyText: (text: string) => Promise<void> | void
  prettyJson: (value: unknown) => string
}>()
</script>

<template>
  <section class="panel tester-grid">
    <div class="test-actions">
      <div class="section-head compact">
        <div>
          <h2>接口测试</h2>
          <p>先测模型列表，再按当前接口模式测试生成请求。</p>
        </div>
      </div>

      <el-radio-group v-model="config.apiMode" class="tester-mode">
        <el-radio-button label="chat_completions">Chat Completions</el-radio-button>
        <el-radio-button label="responses">Responses API</el-radio-button>
      </el-radio-group>

      <el-tag type="info" class="endpoint-tag">{{ activeCompletionEndpoint }}</el-tag>
      <el-tag :type="config.requestTransport === 'local_proxy' ? 'warning' : 'info'" class="endpoint-tag">
        {{ requestTransportLabel }}
      </el-tag>
      <p v-if="config.requestTransport === 'local_proxy'" class="proxy-note">
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
</template>
