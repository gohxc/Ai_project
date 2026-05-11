export function extractModelIds(value: unknown) {
    if (!value || typeof value !== 'object') return []

    const data = (value as { data?: unknown }).data
    if (!Array.isArray(data)) return []

    return data
        .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
                return (item as { id: string }).id
            }
            return ''
        })
        .filter((model) => model.trim())
}
