import { ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppState, ChatMessage, RequestHistoryItem } from '../lib/types'
import { addHistory, createId } from '../lib/storage'
import {
    createChatCompletion,
    createResponse,
    extractAssistantText,
    extractResponseText,
    streamChatCompletion,
    streamResponse,
} from '../lib/openaiClient'
import { prettyJson } from '../lib/format'
import type { ActiveApiConfig } from './useApiTesting'

export function useChatSession(
    state: AppState,
    activeTab: Ref<string>,
    activeApiConfig: ComputedRef<ActiveApiConfig>,
    activeCompletionEndpoint: ComputedRef<string>,
    setLastRequestBody: (body: unknown) => void,
) {
    const sendingChat = ref(false)
    const userInput = ref('')

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

    async function sendMessage() {
        if (!validateConfig()) return

        const content = userInput.value.trim()
        if (!content) return

        const userMessage: ChatMessage = {
            id: createId('msg'),
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        }
        const assistantMessage: ChatMessage = {
            id: createId('msg'),
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
        }
        const messagesForRequest = [...state.messages, userMessage]

        state.messages.push(userMessage, assistantMessage)
        userInput.value = ''
        sendingChat.value = true

        try {
            if (state.config.stream) {
                const result =
                    state.config.apiMode === 'responses'
                        ? await streamResponse(activeApiConfig.value, messagesForRequest, (token) => {
                            assistantMessage.content += token
                        })
                        : await streamChatCompletion(activeApiConfig.value, messagesForRequest, (token) => {
                            assistantMessage.content += token
                        })
                setLastRequestBody(result.requestBody)

                if (!result.ok) {
                    assistantMessage.content = result.error ?? '请求失败'
                }

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
            } else {
                const result =
                    state.config.apiMode === 'responses'
                        ? await createResponse(activeApiConfig.value, messagesForRequest)
                        : await createChatCompletion(activeApiConfig.value, messagesForRequest)
                setLastRequestBody(result.requestBody)
                assistantMessage.content = result.ok
                    ? (state.config.apiMode === 'responses'
                        ? extractResponseText(result.data)
                        : extractAssistantText(result.data)) || prettyJson(result.data)
                    : result.error || '请求失败'

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
            }
        } catch (error) {
            assistantMessage.content = error instanceof Error ? error.message : String(error)
            ElMessage.error('聊天请求失败')
        } finally {
            sendingChat.value = false
        }
    }

    function clearMessages() {
        state.messages = []
        ElMessage.success('会话已清空')
    }

    return {
        sendingChat,
        userInput,
        sendMessage,
        clearMessages,
    }
}
