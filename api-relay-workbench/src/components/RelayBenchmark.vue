<script setup lang="ts">
import { Setting, Stopwatch } from '@element-plus/icons-vue'
import type { RelayBenchmarkResult, RelayEndpoint } from '../lib/types'

const benchmarkMode = defineModel<'connectivity' | 'real'>('benchmarkMode', { required: true })
const benchmarkPrompt = defineModel<string>('benchmarkPrompt', { required: true })
const benchmarkTimeoutMs = defineModel<number>('benchmarkTimeoutMs', { required: true })
const benchmarkRunCount = defineModel<number>('benchmarkRunCount', { required: true })

const props = defineProps<{
  relayEndpoints: RelayEndpoint[]
  sortedBenchmarkResults: RelayBenchmarkResult[]
  benchmarkRunning: boolean
  onManageRelays: () => void
  onRunBenchmark: () => void | Promise<void>
}>()
</script>

<template>
  <section class="panel benchmark-panel">
    <div class="section-head">
      <div>
        <h2>中转测速</h2>
        <p>直接使用“中转管理”里已启用的档案；连通性测试不需要 Key，真实速度测试使用档案自己的 Key 和模型。</p>
      </div>
      <div class="section-actions">
        <el-button :icon="Setting" @click="props.onManageRelays">管理中转站</el-button>
        <el-button type="primary" :icon="Stopwatch" :loading="props.benchmarkRunning" @click="props.onRunBenchmark">
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

    <el-table :data="relayEndpoints" class="relay-source-table" empty-text="暂无中转站档案">
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
      <el-table-column prop="minMs" label="最短" width="100" sortable>
        <template #default="{ row }">{{ row.minMs ? `${row.minMs}ms` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="avgMs" label="平均" width="100" sortable>
        <template #default="{ row }">{{ row.avgMs ? `${row.avgMs}ms` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="maxMs" label="最长" width="100" sortable>
        <template #default="{ row }">{{ row.maxMs ? `${row.maxMs}ms` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="error" label="错误" min-width="220" show-overflow-tooltip />
    </el-table>
  </section>
</template>
