import { ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppState, RequestHistoryItem } from '../lib/types'
import { addHistory, createId } from '../lib/storage'
import { createImageGeneration, extractGeneratedImages } from '../lib/openaiClient'

interface ImageApiConfig {
    baseUrl: string
    apiKey: string
    requestTransport: AppState['config']['requestTransport']
}

export function useImageGeneration(
    state: AppState,
    activeTab: Ref<string>,
    imageApiConfig: ComputedRef<ImageApiConfig>,
    setLastRequestBody: (body: unknown) => void,
) {
    const generatingImages = ref(false)
    const imageResult = ref<unknown>(null)
    const imageItems = ref<Array<{ url: string; revisedPrompt: string }>>([])
    const imageGenerationDurationMs = ref<number | null>(null)

    function recordHistory(item: Omit<RequestHistoryItem, 'id' | 'createdAt'>) {
        addHistory(state, {
            ...item,
            id: createId('hist'),
            createdAt: new Date().toISOString(),
        })
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

    async function generateImage() {
        if (!validateImageConfig()) return

        generatingImages.value = true
        imageResult.value = null
        imageItems.value = []
        imageGenerationDurationMs.value = null

        try {
            const result = await createImageGeneration(imageApiConfig.value, state.imageConfig)
            imageResult.value = result.data ?? result.error
            imageItems.value = result.ok ? extractGeneratedImages(result.data, state.imageConfig.outputFormat) : []
            imageGenerationDurationMs.value = result.durationMs
            setLastRequestBody(result.requestBody)

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
        } finally {
            generatingImages.value = false
        }
    }

    return {
        generatingImages,
        imageResult,
        imageItems,
        imageGenerationDurationMs,
        generateImage,
    }
}
