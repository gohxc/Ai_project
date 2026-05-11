<script setup lang="ts">
import { Delete, DocumentCopy, Promotion } from '@element-plus/icons-vue'
import type { AppState, ChatMessage } from '../lib/types'

const userInput = defineModel<string>('userInput', { required: true })

const props = defineProps<{
  config: AppState['config']
  visibleMessages: ChatMessage[]
  sendingChat: boolean
  lastRequestBody: unknown
  previewRequestBody: unknown
  onClearMessages: () => void
  onSendMessage: () => void | Promise<void>
  onCopyText: (text: string) => Promise<void> | void
  prettyJson: (value: unknown) => string
}>()
</script>

<template>
  <section class="chat-layout">
    <div class="chat-panel">
      <div class="section-head compact">
        <div>
          <h2>聊天测试</h2>
          <p>{{ props.config.stream ? '当前使用流式输出' : '当前使用普通响应' }}</p>
        </div>
        <el-button :icon="Delete" @click="props.onClearMessages">清空会话</el-button>
      </div>

      <div class="messages">
        <el-empty v-if="props.visibleMessages.length === 0" description="暂无消息" />
        <div
          v-for="message in props.visibleMessages"
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
          @keydown.ctrl.enter.prevent="props.onSendMessage"
        />
        <el-button type="primary" :icon="Promotion" :loading="props.sendingChat" @click="props.onSendMessage">
          发送
        </el-button>
      </div>
    </div>

    <div class="debug-box side-debug">
      <div class="debug-title">
        <strong>最近请求</strong>
        <el-button link :icon="DocumentCopy" @click="props.onCopyText(props.prettyJson(props.lastRequestBody || props.previewRequestBody))">
          复制
        </el-button>
      </div>
      <pre>{{ props.prettyJson(props.lastRequestBody || props.previewRequestBody) }}</pre>
    </div>
  </section>
</template>
