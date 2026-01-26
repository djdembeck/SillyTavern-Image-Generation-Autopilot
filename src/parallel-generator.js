const DEFAULT_CONCURRENCY_LIMIT = 4
const MAX_CONCURRENCY_LIMIT = 8
const MIN_CONCURRENCY_LIMIT = 1

function clampConcurrencyLimit(value) {
    if (!Number.isFinite(value)) {
        return DEFAULT_CONCURRENCY_LIMIT
    }
    return Math.min(
        MAX_CONCURRENCY_LIMIT,
        Math.max(MIN_CONCURRENCY_LIMIT, Math.floor(value)),
    )
}

function normalizePromptEntry(entry) {
    if (typeof entry === 'string') {
        return { prompt: entry }
    }

    if (entry && typeof entry === 'object') {
        return {
            prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
            modelId: typeof entry.modelId === 'string' ? entry.modelId : undefined,
        }
    }

    return { prompt: '' }
}

function buildModelCycle(queue) {
    if (!Array.isArray(queue)) {
        return []
    }

    const cycle = []
    for (const entry of queue) {
        const id = typeof entry?.id === 'string' ? entry.id.trim() : ''
        const count = Number.isFinite(entry?.count)
            ? Math.max(0, Math.floor(entry.count))
            : 0
        if (!id || count <= 0) {
            continue
        }
        for (let i = 0; i < count; i += 1) {
            cycle.push(id)
        }
    }

    return cycle
}

function createErrorResult(prompt, modelId, error) {
    return {
        status: 'error',
        prompt,
        modelId,
        error,
    }
}

function createSuccessResult(prompt, modelId, response) {
    return {
        status: 'ok',
        prompt,
        modelId,
        result: response,
    }
}

class ParallelGenerator {
    constructor(options = {}) {
        this.concurrencyLimit = clampConcurrencyLimit(options.concurrencyLimit)
        this.callSdSlash = options.callSdSlash
        this._abortRequested = false
        this._progressHandler = null
        this._running = false
    }

    abort() {
        this._abortRequested = true
    }

    onProgress(callback) {
        this._progressHandler = typeof callback === 'function' ? callback : null
        return this
    }

    async run(prompts, options = {}) {
        const entries = Array.isArray(prompts)
            ? prompts.map(normalizePromptEntry)
            : []
        const total = entries.length
        const results = Array.from({ length: total })

        if (!total) {
            return results
        }

        if (typeof this.callSdSlash !== 'function') {
            const error = new Error('callSdSlash is not configured')
            for (let i = 0; i < total; i += 1) {
                const entry = entries[i]
                results[i] = createErrorResult(entry.prompt, entry.modelId, error)
            }
            return results
        }

        this._abortRequested = false
        this._running = true

        const quiet = !!options.quiet
        const modelCycle = buildModelCycle(options.modelQueue)
        const tasks = entries.map((entry, index) => {
            const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
            const modelId = entry.modelId?.trim()
                ? entry.modelId.trim()
                : modelCycle.length > 0
                    ? modelCycle[index % modelCycle.length]
                    : undefined
            return {
                index,
                prompt,
                modelId,
            }
        })

        const stats = { completed: 0, failed: 0 }
        let nextIndex = 0
        const workerCount = Math.min(this.concurrencyLimit, total)

        const worker = async (slotIndex) => {
            while (true) {
                if (this._abortRequested) {
                    return
                }

                const taskIndex = nextIndex
                nextIndex += 1
                if (taskIndex >= tasks.length) {
                    return
                }

                const task = tasks[taskIndex]
                let result

                try {
                    const response = await this.callSdSlash(
                        task.prompt,
                        quiet,
                        task.modelId,
                    )
                    if (response == null) {
                        throw new Error('SD generation failed')
                    }
                    result = createSuccessResult(
                        task.prompt,
                        task.modelId,
                        response,
                    )
                    stats.completed += 1
                } catch (error) {
                    result = createErrorResult(task.prompt, task.modelId, error)
                    stats.failed += 1
                }

                results[task.index] = result
                if (this._progressHandler) {
                    this._progressHandler({
                        completed: stats.completed,
                        failed: stats.failed,
                        total,
                        slotIndex,
                        result,
                    })
                }
            }
        }

        try {
            const workers = []
            for (let i = 0; i < workerCount; i += 1) {
                workers.push(worker(i))
            }
            await Promise.all(workers)
        } finally {
            this._running = false
        }

        if (this._abortRequested) {
            const abortError = new Error('aborted')
            for (let i = 0; i < results.length; i += 1) {
                if (!results[i]) {
                    const task = tasks[i]
                    results[i] = createErrorResult(
                        task.prompt,
                        task.modelId,
                        abortError,
                    )
                }
            }
        }

        return results
    }
}

export { ParallelGenerator }
