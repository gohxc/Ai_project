import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppState, ChatMessage, RequestHistoryItem } from '../lib/types'
import { createId, addHistory } from '../lib/storage'
import {
    buildChatBody,
    buildResponsesBody,
    createChatCompletion,
    createResponse,
    listModels,
    streamChatCompletion,
    streamResponse,
} from '../lib/openaiClient'

export interface ActiveApiConfig {
    activeRelayId: string
    baseUrl: string
    apiKey: string
    model: string
    apiMode: AppState['config']['apiMode']
    requestTransport: AppState['config']['requestTransport']
    stream: boolean
    temperature: number
    systemPrompt: string
}

export function useApiTesting(
    state: AppState,
    activeTab: Ref<string>,
    activeApiConfig: ComputedRef<ActiveApiConfig>,
    copyText: (text: string) => Promise<void>,
) {
    const testingModels = ref(false)
    const testingChat = ref(false)
    const modelsResult = ref<unknown>(null)
    const chatTestResult = ref<unknown>(null)
    const lastRequestBody = ref<unknown>(null)

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

    function recordHistory(item: Omit<RequestHistoryItem, 'id' | 'createdAt'>) {
        addHistory(state, {
            ...item,
            id: createId('hist'),
            createdAt: new Date().toISOString(),
        })
    }

    function validateConfig() {
        if (!state.relayEndpoints.length) {
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

    async function testModels() {
        if (!validateConfig()) return

        testingModels.value = true
        modelsResult.value = null
        try {
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
        } finally {
            testingModels.value = false
        }
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

        try {
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
        } finally {
            testingChat.value = false
        }
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

    return {
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
    }
}
