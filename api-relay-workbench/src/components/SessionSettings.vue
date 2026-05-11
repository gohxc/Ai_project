<script setup lang="ts">
import type { AppState, RelayEndpoint } from '../lib/types'

const config = defineModel<AppState['config']>('config', { required: true })

defineProps<{
  relayEndpoints: RelayEndpoint[]
  activeApiConfig: Pick<AppState['config'], 'baseUrl' | 'model'>
}>()
</script>

<template>
  <section class="panel">
    <div class="section-head">
      <div>
        <h2>当前会话设置</h2>
        <p>地址、Key 和模型在中转管理维护；这里选择当前中转站和本次会话参数。</p>
      </div>
    </div>

    <el-form label-position="top" class="config-form">
      <el-form-item label="当前中转站">
        <el-select v-model="config.activeRelayId" placeholder="请选择中转站" filterable>
          <el-option
            v-for="endpoint in relayEndpoints"
            :key="endpoint.id"
            :label="`${endpoint.name} · ${endpoint.model || '未配置模型'}`"
            :value="endpoint.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="接口模式">
        <el-radio-group v-model="config.apiMode">
          <el-radio-button label="chat_completions">Chat Completions</el-radio-button>
          <el-radio-button label="responses">Responses API</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="请求通道">
        <el-segmented
          v-model="config.requestTransport"
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
        <el-slider v-model="config.temperature" :min="0" :max="2" :step="0.1" show-input />
      </el-form-item>

      <el-form-item label="系统提示词">
        <el-input v-model="config.systemPrompt" type="textarea" :rows="4" />
      </el-form-item>
    </el-form>
  </section>
</template>
