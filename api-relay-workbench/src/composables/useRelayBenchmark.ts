import { computed, ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppState, ChatMessage, RelayBenchmarkResult, RelayEndpoint } from '../lib/types'
import { createId } from '../lib/storage'
import { createChatCompletion, createResponse, listModels } from '../lib/openaiClient'

interface BenchmarkRequestResult {
    ok: boolean
    statusCode?: number
    durationMs: number
    data?: unknown
    error?: string
    requestBody?: unknown
}

export function useRelayBenchmark(state: AppState, activeTab: Ref<string>) {
    const benchmarkRunning = ref(false)
    const benchmarkResults = ref<RelayBenchmarkResult[]>([])
    const benchmarkMode = ref<'connectivity' | 'real'>('connectivity')
    const benchmarkPrompt = ref('请只回复：pong')
    const benchmarkTimeoutMs = ref(30_000)
    const benchmarkRunCount = ref(5)

    const sortedBenchmarkResults = computed(() =>
        [...benchmarkResults.value].sort((a, b) => {
            if (a.status === 'success' && b.status !== 'success') return -1
            if (a.status !== 'success' && b.status === 'success') return 1
            return (
                (a.avgMs ?? a.totalMs ?? Number.MAX_SAFE_INTEGER) -
                (b.avgMs ?? b.totalMs ?? Number.MAX_SAFE_INTEGER)
            )
        }),
    )

    function benchmarkSourceEndpoints() {
        return state.relayEndpoints.filter((endpoint) => endpoint.enabled && endpoint.baseUrl.trim())
    }

    function realBenchmarkIssues(endpoint: RelayEndpoint) {
        return [
            !endpoint.apiKey.trim() ? '缺少 API Key' : '',
            !endpoint.model.trim() ? '缺少模型名称' : '',
        ].filter(Boolean)
    }

    function canRunRealBenchmark(endpoint: RelayEndpoint) {
        return realBenchmarkIssues(endpoint).length === 0
    }

    function validateBenchmarkConfig() {
        const usableEndpoints = benchmarkSourceEndpoints()
        if (usableEndpoints.length === 0) {
            ElMessage.error('请至少启用一个中转站档案')
            activeTab.value = 'relays'
            return false
        }

        if (benchmarkMode.value === 'real') {
            const runnableEndpoints = usableEndpoints.filter(canRunRealBenchmark)
            if (runnableEndpoints.length === 0) {
                ElMessage.error('真实速度测试至少需要一个已填写 Key 和模型的中转站')
                activeTab.value = 'relays'
                return false
            }
        }

        return true
    }

    function buildBenchmarkConfig(endpoint: RelayEndpoint, apiKey: string) {
        return {
            ...state.config,
            baseUrl: endpoint.baseUrl.trim(),
            apiKey,
            model: endpoint.model,
            stream: false,
        }
    }

    async function benchmarkConnectivity(endpoint: RelayEndpoint): Promise<RelayBenchmarkResult> {
        const config = buildBenchmarkConfig(endpoint, '')
        const modelsResult = await listModels(config, { timeoutMs: benchmarkTimeoutMs.value })
        const canReachHttp = typeof modelsResult.statusCode === 'number'

        return {
            id: endpoint.id,
            name: endpoint.name,
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            status: canReachHttp ? 'success' : 'error',
            modelsMs: modelsResult.durationMs,
            totalMs: modelsResult.durationMs,
            statusCode: modelsResult.statusCode,
            error: canReachHttp ? undefined : modelsResult.error,
            testedAt: new Date().toISOString(),
        }
    }

    async function runBenchmarkGeneration(endpoint: RelayEndpoint): Promise<BenchmarkRequestResult> {
        const config = buildBenchmarkConfig(endpoint, endpoint.apiKey)
        const testMessage: ChatMessage = {
            id: createId('msg'),
            role: 'user',
            content: benchmarkPrompt.value.trim() || '请只回复：pong',
            createdAt: new Date().toISOString(),
        }

        return state.config.apiMode === 'responses'
            ? await createResponse(config, [testMessage], { timeoutMs: benchmarkTimeoutMs.value })
            : await createChatCompletion(config, [testMessage], { timeoutMs: benchmarkTimeoutMs.value })
    }

    function summarizeBenchmarkRuns(
        endpoint: RelayEndpoint,
        results: BenchmarkRequestResult[],
        runCount: number,
        startedAt: number,
    ): RelayBenchmarkResult {
        const successfulResults = results.filter((result) => result.ok)
        const successfulDurations = successfulResults.map((result) => result.durationMs)
        const firstError = results.find((result) => !result.ok)
        const minMs = successfulDurations.length > 0 ? Math.min(...successfulDurations) : undefined
        const maxMs = successfulDurations.length > 0 ? Math.max(...successfulDurations) : undefined
        const avgMs =
            successfulDurations.length > 0
                ? Math.round(successfulDurations.reduce((sum, duration) => sum + duration, 0) / successfulDurations.length)
                : undefined

        if (successfulResults.length === 0) {
            return {
                id: endpoint.id,
                name: endpoint.name,
                baseUrl: endpoint.baseUrl,
                model: endpoint.model,
                status: 'error',
                totalMs: Math.round(performance.now() - startedAt),
                runCount,
                successCount: 0,
                statusCode: firstError?.statusCode,
                error: firstError?.error || '全部测速请求失败',
                testedAt: new Date().toISOString(),
            }
        }

        return {
            id: endpoint.id,
            name: endpoint.name,
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            status: 'success',
            chatMs: avgMs,
            totalMs: Math.round(performance.now() - startedAt),
            minMs,
            maxMs,
            avgMs,
            runCount,
            successCount: successfulResults.length,
            statusCode: firstError?.statusCode ?? successfulResults[0]?.statusCode,
            error: firstError ? `${successfulResults.length}/${runCount} 成功；${firstError.error || '部分测速请求失败'}` : undefined,
            testedAt: new Date().toISOString(),
        }
    }

    async function runRealBenchmark(endpoints: RelayEndpoint[]) {
        const runCount = Math.max(1, Math.round(benchmarkRunCount.value || 1))
        const startedAtByEndpoint = new Map(endpoints.map((endpoint) => [endpoint.id, performance.now()]))
        const resultsByEndpoint = new Map(endpoints.map((endpoint) => [endpoint.id, [] as BenchmarkRequestResult[]]))

        for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
            const roundResults = await Promise.all(
                endpoints.map(async (endpoint) => ({
                    endpoint,
                    result: await runBenchmarkGeneration(endpoint),
                })),
            )

            for (const { endpoint, result } of roundResults) {
                const endpointResults = resultsByEndpoint.get(endpoint.id)
                endpointResults?.push(result)

                const index = benchmarkResults.value.findIndex((item) => item.id === endpoint.id)
                if (index >= 0 && endpointResults) {
                    benchmarkResults.value[index] = summarizeBenchmarkRuns(
                        endpoint,
                        endpointResults,
                        runCount,
                        startedAtByEndpoint.get(endpoint.id) ?? performance.now(),
                    )
                }
            }
        }

        for (const endpoint of endpoints) {
            const index = benchmarkResults.value.findIndex((result) => result.id === endpoint.id)
            if (index >= 0) {
                benchmarkResults.value[index] = summarizeBenchmarkRuns(
                    endpoint,
                    resultsByEndpoint.get(endpoint.id) ?? [],
                    runCount,
                    startedAtByEndpoint.get(endpoint.id) ?? performance.now(),
                )
            }
        }
    }

    async function runBenchmark() {
        if (!validateBenchmarkConfig()) return

        const endpoints = benchmarkSourceEndpoints()
        benchmarkRunning.value = true
        try {
            benchmarkResults.value = endpoints.map((endpoint) => {
                const issues = benchmarkMode.value === 'real' ? realBenchmarkIssues(endpoint) : []

                return {
                    id: endpoint.id,
                    name: endpoint.name,
                    baseUrl: endpoint.baseUrl,
                    model: endpoint.model,
                    status: issues.length > 0 ? 'error' : 'testing',
                    error: issues.length > 0 ? issues.join('、') : undefined,
                    testedAt: issues.length > 0 ? new Date().toISOString() : undefined,
                }
            })

            if (benchmarkMode.value === 'real') {
                await runRealBenchmark(endpoints.filter(canRunRealBenchmark))
            } else {
                const results = await Promise.all(endpoints.map((endpoint) => benchmarkConnectivity(endpoint)))
                for (const result of results) {
                    const index = benchmarkResults.value.findIndex((item) => item.id === result.id)
                    if (index >= 0) benchmarkResults.value[index] = result
                }
            }

            ElMessage.success('测速完成')
        } finally {
            benchmarkRunning.value = false
        }
    }

    function clearBenchmarkResults() {
        benchmarkResults.value = []
    }

    return {
        benchmarkRunning,
        benchmarkResults,
        benchmarkMode,
        benchmarkPrompt,
        benchmarkTimeoutMs,
        benchmarkRunCount,
        sortedBenchmarkResults,
        runBenchmark,
        clearBenchmarkResults,
    }
}
