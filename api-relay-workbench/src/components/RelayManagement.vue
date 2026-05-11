<script setup lang="ts">
import { Connection, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import type { RelayEndpoint } from '../lib/types'

const selectedRelayId = defineModel<string>('selectedRelayId', { required: true })

const props = defineProps<{
  relayEndpoints: RelayEndpoint[]
  selectedRelay: RelayEndpoint | undefined
  activeRelayId: string
  fetchingRelayModels: Record<string, boolean>
  onAddRelay: () => void
  onRemoveRelay: (id: string) => void
  onUseRelay: (endpoint: RelayEndpoint) => void
  onFetchRelayModels: (endpoint: RelayEndpoint) => void | Promise<void>
}>()

function selectRelay(id: string) {
  selectedRelayId.value = id
}
</script>

<template>
  <section class="panel relays-panel">
    <div class="section-head">
      <div>
        <h2>中转管理</h2>
        <p>统一保存每个中转站的地址、Key 和模型；测试、聊天和测速都可直接复用。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="props.onAddRelay">添加中转站</el-button>
    </div>

    <div class="relay-management-layout">
      <aside class="relay-list-panel">
        <div class="relay-list" role="list" aria-label="中转站列表">
          <button
            v-for="endpoint in props.relayEndpoints"
            :key="endpoint.id"
            type="button"
            class="relay-list-item"
            :class="{ active: endpoint.id === props.selectedRelay?.id }"
            @click="selectRelay(endpoint.id)"
          >
            <div class="relay-list-item-head">
              <strong>{{ endpoint.name }}</strong>
              <el-tag v-if="endpoint.id === props.activeRelayId" size="small" type="success">当前</el-tag>
              <el-tag v-else-if="endpoint.enabled" size="small">启用</el-tag>
              <el-tag v-else size="small" type="info">停用</el-tag>
            </div>
            <span class="relay-list-item-url">{{ endpoint.baseUrl || '未填写 Base URL' }}</span>
            <span class="relay-list-item-model">{{ endpoint.model || '未配置模型' }}</span>
          </button>
        </div>
      </aside>

      <section class="relay-settings" v-if="props.selectedRelay">
        <div class="section-head compact">
          <div>
            <h2>{{ props.selectedRelay.name || '未命名中转站' }}</h2>
            <p>编辑左侧选中的中转站设置，点击“设为当前”会切换测试、聊天和测速实际使用的中转站。</p>
          </div>
          <div class="section-actions">
            <el-button :icon="Connection" @click="props.onUseRelay(props.selectedRelay)">设为当前</el-button>
            <el-button
              :icon="Delete"
              :disabled="props.relayEndpoints.length <= 1"
              @click="props.onRemoveRelay(props.selectedRelay.id)"
            />
          </div>
        </div>

        <el-form label-position="top">
          <div class="relay-settings-head">
            <el-switch v-model="props.selectedRelay.enabled" active-text="启用" inactive-text="停用" />
            <el-tag v-if="props.selectedRelay.id === props.activeRelayId" type="success">当前使用</el-tag>
            <el-tag v-else type="info">仅编辑</el-tag>
          </div>

          <div class="relay-form-grid">
            <el-form-item label="名称">
              <el-input v-model="props.selectedRelay.name" placeholder="例如：中转站 A" />
            </el-form-item>
            <el-form-item label="模型">
              <div class="model-picker">
                <el-select
                  v-model="props.selectedRelay.model"
                  allow-create
                  filterable
                  default-first-option
                  placeholder="先获取模型，或手动输入"
                >
                  <el-option v-for="model in props.selectedRelay.models" :key="model" :label="model" :value="model" />
                </el-select>
                <el-button
                  :icon="Refresh"
                  :loading="props.fetchingRelayModels[props.selectedRelay.id]"
                  @click="props.onFetchRelayModels(props.selectedRelay)"
                >
                  获取模型
                </el-button>
              </div>
            </el-form-item>
          </div>

          <el-form-item label="API Base URL">
            <el-input v-model="props.selectedRelay.baseUrl" placeholder="https://example.com/v1" />
          </el-form-item>

          <el-form-item label="API Key">
            <el-input
              v-model="props.selectedRelay.apiKey"
              type="password"
              placeholder="sk-..."
              show-password
            />
          </el-form-item>

          <el-form-item label="备注">
            <el-input v-model="props.selectedRelay.note" placeholder="套餐、来源、限制等" />
          </el-form-item>

          <div class="relay-meta">
            <el-tag v-if="props.selectedRelay.models.length > 0" type="success">
              {{ props.selectedRelay.models.length }} 个模型
            </el-tag>
            <el-tag v-else type="info">未获取模型</el-tag>
            <span v-if="props.selectedRelay.modelsFetchedAt">
              {{ new Date(props.selectedRelay.modelsFetchedAt).toLocaleString() }}
            </span>
          </div>
        </el-form>
      </section>
    </div>
  </section>
</template>
