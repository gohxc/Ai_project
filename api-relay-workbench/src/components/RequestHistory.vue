<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue'
import type { RequestHistoryItem } from '../lib/types'

defineProps<{
  history: RequestHistoryItem[]
  onClearHistory: () => void
}>()
</script>

<template>
  <section class="panel">
    <div class="section-head">
      <div>
        <h2>请求历史</h2>
        <p>最多保存最近 50 条，只保存在当前浏览器。</p>
      </div>
      <el-button :icon="Delete" @click="onClearHistory">清空历史</el-button>
    </div>

    <el-table :data="history" height="590" empty-text="暂无请求历史">
      <el-table-column prop="type" label="类型" width="110">
        <template #default="{ row }">
          <el-tag :type="row.type === 'models' ? 'info' : row.type === 'image' ? 'warning' : 'success'">
            {{ row.type }}
          </el-tag>
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
</template>
