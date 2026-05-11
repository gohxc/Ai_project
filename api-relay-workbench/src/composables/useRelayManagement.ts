import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppState, RelayEndpoint } from '../lib/types'
import { createId } from '../lib/storage'
import { listModels } from '../lib/openaiClient'
import { extractModelIds } from '../lib/models'

export function useRelayManagement(state: AppState) {
    const fetchingRelayModels = ref<Record<string, boolean>>({})
    const selectedRelayId = ref(state.config.activeRelayId || state.relayEndpoints[0]?.id || '')

    const activeRelay = computed(() => {
        const selected = state.relayEndpoints.find((endpoint) => endpoint.id === state.config.activeRelayId)
        return selected ?? state.relayEndpoints[0]
    })

    const selectedRelay = computed(() => {
        const selected = state.relayEndpoints.find((endpoint) => endpoint.id === selectedRelayId.value)
        return selected ?? activeRelay.value ?? state.relayEndpoints[0]
    })

    watch(
        () => [state.relayEndpoints, state.config.activeRelayId] as const,
        () => {
            if (selectedRelayId.value && state.relayEndpoints.some((endpoint) => endpoint.id === selectedRelayId.value)) {
                return
            }

            selectedRelayId.value = state.config.activeRelayId || state.relayEndpoints[0]?.id || ''
        },
        { deep: true, immediate: true },
    )

    function addRelayEndpoint() {
        const endpoint = {
            id: createId('relay'),
            name: `中转站 ${state.relayEndpoints.length + 1}`,
            baseUrl: '',
            apiKey: '',
            model: activeRelay.value?.model || state.config.model,
            models: [],
            enabled: true,
            note: '',
        }
        state.relayEndpoints.push(endpoint)
        state.config.activeRelayId = endpoint.id
        selectedRelayId.value = endpoint.id
    }

    function removeRelayEndpoint(id: string) {
        const remaining = state.relayEndpoints.filter((endpoint) => endpoint.id !== id)
        state.relayEndpoints = remaining

        if (state.config.activeRelayId === id) {
            state.config.activeRelayId = remaining[0]?.id ?? ''
        }

        if (selectedRelayId.value === id) {
            selectedRelayId.value = state.config.activeRelayId || remaining[0]?.id || ''
        }
    }

    function useRelayEndpoint(endpoint: RelayEndpoint) {
        state.config.activeRelayId = endpoint.id
        selectedRelayId.value = endpoint.id
        ElMessage.success('已切换到该中转站')
    }

    async function fetchRelayModels(endpoint: RelayEndpoint) {
        if (!endpoint.baseUrl.trim()) {
            ElMessage.error('请先填写 API Base URL')
            return
        }

        fetchingRelayModels.value[endpoint.id] = true
        try {
            const result = await listModels({
                ...state.config,
                baseUrl: endpoint.baseUrl,
                apiKey: endpoint.apiKey,
                model: endpoint.model || activeRelay.value?.model || state.config.model,
            })

            if (!result.ok) {
                ElMessage.error(result.error || '获取模型列表失败')
                return
            }

            const models = extractModelIds(result.data)
            endpoint.models = models
            endpoint.modelsFetchedAt = new Date().toISOString()

            if (models.length > 0) {
                if (!endpoint.model || !models.includes(endpoint.model)) {
                    endpoint.model = models[0]
                }
                ElMessage.success(`已获取 ${models.length} 个模型`)
            } else {
                ElMessage.warning('接口返回成功，但没有识别到模型 ID，可继续手动输入')
            }
        } finally {
            fetchingRelayModels.value[endpoint.id] = false
        }
    }

    return {
        activeRelay,
        selectedRelay,
        selectedRelayId,
        fetchingRelayModels,
        addRelayEndpoint,
        removeRelayEndpoint,
        useRelayEndpoint,
        fetchRelayModels,
    }
}
