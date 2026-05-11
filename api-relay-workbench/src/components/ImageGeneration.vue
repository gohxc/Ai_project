<script setup lang="ts">
import { DocumentCopy, Picture } from '@element-plus/icons-vue'
import type { AppState } from '../lib/types'

const imageConfig = defineModel<AppState['imageConfig']>('imageConfig', { required: true })

const props = defineProps<{
  requestTransportLabel: string
  requestTransport: AppState['config']['requestTransport']
  generatingImages: boolean
  imageGenerationDurationMs: number | null
  imageResult: unknown
  imageItems: Array<{ url: string; revisedPrompt: string }>
  imageRequestBody: unknown
  imageGenerationRequestUrl: string
  onGenerateImage: () => void | Promise<void>
  onCopyText: (text: string) => Promise<void> | void
  prettyJson: (value: unknown) => string
}>()
</script>

<template>
  <section class="panel image-panel">
    <div class="section-head">
      <div>
        <h2>图片生成</h2>
        <p>图片页使用独立的 Base URL 和 API Key，请求 `POST /images/generations`。</p>
      </div>
      <div class="section-actions">
        <el-tag type="info">{{ imageConfig.baseUrl || '未填写图片地址' }}</el-tag>
        <el-tag :type="props.requestTransport === 'local_proxy' ? 'warning' : 'info'">
          {{ props.requestTransportLabel }}
        </el-tag>
        <el-tag v-if="props.generatingImages" type="warning">生成计时中</el-tag>
        <el-tag v-else-if="props.imageGenerationDurationMs !== null" type="success">
          生成耗时 {{ props.imageGenerationDurationMs }}ms
        </el-tag>
        <el-button type="primary" :icon="Picture" :loading="props.generatingImages" @click="props.onGenerateImage">
          生成图片
        </el-button>
      </div>
    </div>

    <div class="image-layout">
      <div class="image-form-wrap">
        <el-form label-position="top">
          <el-form-item label="图片 API Base URL">
            <el-input v-model="imageConfig.baseUrl" placeholder="https://example.com/v1" />
          </el-form-item>

          <el-form-item label="图片 API Key">
            <el-input v-model="imageConfig.apiKey" type="password" placeholder="sk-..." show-password />
          </el-form-item>

          <div class="relay-form-grid">
            <el-form-item label="图片模型">
              <el-input v-model="imageConfig.model" placeholder="gpt-image-2" />
            </el-form-item>
            <el-form-item label="生成数量">
              <el-input-number v-model="imageConfig.imageCount" :min="1" :max="4" controls-position="right" />
            </el-form-item>
          </div>

          <el-form-item label="提示词">
            <el-input
              v-model="imageConfig.prompt"
              type="textarea"
              :rows="5"
              placeholder="描述你想生成的图片内容"
            />
          </el-form-item>

          <div class="relay-form-grid">
            <el-form-item label="尺寸">
              <el-select v-model="imageConfig.size">
                <el-option label="1024x1024" value="1024x1024" />
                <el-option label="1536x1024" value="1536x1024" />
                <el-option label="1024x1536" value="1024x1536" />
                <el-option label="auto" value="auto" />
              </el-select>
            </el-form-item>
            <el-form-item label="质量">
              <el-select v-model="imageConfig.quality">
                <el-option label="high" value="high" />
                <el-option label="medium" value="medium" />
                <el-option label="low" value="low" />
                <el-option label="auto" value="auto" />
              </el-select>
            </el-form-item>
            <el-form-item label="背景">
              <el-select v-model="imageConfig.background">
                <el-option label="auto" value="auto" />
                <el-option label="transparent" value="transparent" />
                <el-option label="opaque" value="opaque" />
              </el-select>
            </el-form-item>
            <el-form-item label="输出格式">
              <el-select v-model="imageConfig.outputFormat">
                <el-option label="png" value="png" />
                <el-option label="jpeg" value="jpeg" />
                <el-option label="webp" value="webp" />
              </el-select>
            </el-form-item>
          </div>

          <p class="field-hint">
            图片页不使用“当前会话设置”里的聊天模型；它只使用这里单独填写的地址和 Key。
          </p>
        </el-form>
      </div>

      <div class="image-debug-panels">
        <div class="debug-box">
          <div class="debug-title">
            <strong>/images/generations 请求预览</strong>
            <el-button link :icon="DocumentCopy" @click="props.onCopyText(props.prettyJson(props.imageRequestBody))">
              复制
            </el-button>
          </div>
          <div class="request-url">{{ props.imageGenerationRequestUrl }}</div>
          <pre>{{ props.prettyJson(props.imageRequestBody) }}</pre>
        </div>

        <div class="debug-box">
          <div class="debug-title">
            <strong>原始响应</strong>
            <span v-if="props.imageGenerationDurationMs !== null" class="duration-text">
              {{ props.imageGenerationDurationMs }}ms
            </span>
            <el-button link :icon="DocumentCopy" @click="props.onCopyText(props.prettyJson(props.imageResult))">复制</el-button>
          </div>
          <pre>{{ props.prettyJson(props.imageResult) || '暂无生成结果' }}</pre>
        </div>
      </div>
    </div>

    <div class="image-gallery">
      <el-empty v-if="props.imageItems.length === 0" description="暂无图片结果" />
      <article v-for="(item, index) in props.imageItems" :key="item.url + index" class="image-card">
        <img :src="item.url" :alt="`generated-${index + 1}`" class="generated-image" />
        <div class="image-card-body">
          <strong>图片 {{ index + 1 }}</strong>
          <p v-if="item.revisedPrompt">{{ item.revisedPrompt }}</p>
          <el-button link :icon="DocumentCopy" @click="props.onCopyText(item.url)">复制图片地址</el-button>
        </div>
      </article>
    </div>
  </section>
</template>
