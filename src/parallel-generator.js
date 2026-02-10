const DEFAULT_CONCURRENCY_LIMIT = 0
const MAX_CONCURRENCY_LIMIT = 8
const MIN_CONCURRENCY_LIMIT = 0

function clampConcurrencyLimit(value) {
    if (!Number.isFinite(value)) {
        return DEFAULT_CONCURRENCY_LIMIT
    }
    return Math.min(
        MAX_CONCURRENCY_LIMIT,
        Math.max(MIN_CONCURRENCY_LIMIT, Math.floor(value)),
    )
}

function normalizePromptEntry(entry, defaultIndex) {
    if (typeof entry === 'string') {
        return { prompt: entry, index: defaultIndex }
    }

    if (entry && typeof entry === 'object') {
        return {
            prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
            modelId:
                typeof entry.modelId === 'string' ? entry.modelId : undefined,
            index: typeof entry.index === 'number' ? entry.index : defaultIndex,
        }
    }

    return { prompt: '', index: defaultIndex }
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
        this.providerRegistry = options.providerRegistry || null
        this._abortRequested = false
        this._progressHandler = null
        this._running = false
    }

    setProviderRegistry(registry) {
        this.providerRegistry = registry
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
            ? prompts.map((p, i) => normalizePromptEntry(p, i))
            : []
        const total = entries.length
        const results = Array.from({ length: total })

        if (!total) {
            return results
        }

        const hasProviderRegistry = this.providerRegistry &&
            typeof this.providerRegistry.getEnabledProviders === 'function' &&
            this.providerRegistry.getEnabledProviders().length > 0

        if (!hasProviderRegistry && typeof this.callSdSlash !== 'function') {
            const error = new Error('No generation method available (callSdSlash or providerRegistry)')
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
        let modelCycleIndex = 0
        const tasks = entries.map((entry) => {
            const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
            const perPromptModelId = entry.modelId?.trim()
            let modelId = perPromptModelId || options.modelId
            const usedCycle = !modelId && modelCycle.length > 0
            if (usedCycle) {
                modelId = modelCycle[modelCycleIndex % modelCycle.length]
            }
            if (usedCycle) {
                modelCycleIndex++
            }
            return {
              index: entry.index,
              prompt,
              modelId,
            }
        })

        // Group consecutive tasks by model to batch same-model generations
        const batches = []
        let currentBatch = { modelId: tasks[0]?.modelId, tasks: [] }
        for (const task of tasks) {
            if (task.modelId !== currentBatch.modelId) {
                batches.push(currentBatch)
                currentBatch = { modelId: task.modelId, tasks: [] }
            }
            currentBatch.tasks.push(task)
        }
        if (currentBatch.tasks.length > 0) {
            batches.push(currentBatch)
        }

        const stats = { completed: 0, failed: 0 }
        const workerCount = this.concurrencyLimit === 0 ? total : Math.min(this.concurrencyLimit, total)
        const retryLimit = Number.isFinite(options.retryLimit)
            ? options.retryLimit
            : 1

        // Process batches sequentially to avoid model change race conditions
        // Within each batch, tasks run concurrently
        for (const batch of batches) {
            if (this._abortRequested) break

            const batchTasks = batch.tasks
            const batchPromises = []

            for (let i = 0; i < Math.min(workerCount, batchTasks.length); i += 1) {
                batchPromises.push((async () => {
                    for (let j = i; j < batchTasks.length; j += workerCount) {
                        if (this._abortRequested) break

                        const task = batchTasks[j]
                        let result
                        let attempts = 0
                        let lastError = null

                        while (attempts <= retryLimit) {
                            if (this._abortRequested) break

                            try {
                                let response

                                if (hasProviderRegistry) {
                                    const providerResult = await this.providerRegistry.generateWithFallback(
                                        task.prompt,
                                        { modelId: task.modelId, quiet }
                                    )
                                    response = providerResult.imageUrl || providerResult
                                } else if (typeof this.callSdSlash === 'function') {
                                    response = await this.callSdSlash(
                                        task.prompt,
                                        quiet,
                                        task.modelId,
                                    )
                                } else {
                                    throw new Error('No generation method available')
                                }

                                if (response == null) {
                                    throw new Error('SD generation failed')
                                }
                                result = createSuccessResult(
                                    task.prompt,
                                    task.modelId,
                                    response,
                                )
                                stats.completed += 1
                                lastError = null
                                break
                            } catch (error) {
                                lastError = error
                                attempts += 1
                                if (stats.completed === 0 && stats.failed >= workerCount) {
                                    break
                                }
                            }
                        }

                        if (this._abortRequested && result === undefined) {
                            continue
                        }

                        if (lastError) {
                            result = createErrorResult(task.prompt, task.modelId, lastError)
                            stats.failed += 1
                        }

                        results[task.index] = result
                        if (this._progressHandler) {
                            this._progressHandler({
                                completed: stats.completed,
                                failed: stats.failed,
                                total,
                                slotIndex: i,
                                taskIndex: task.index,
                                result,
                            })
                        }
                    }
                })())
            }

            await Promise.all(batchPromises)
        }

        this._running = false

        if (this._abortRequested) {
            const abortError = new Error('aborted')
            for (const task of tasks) {
                const idx = task.index
                if (!results[idx]) {
                    results[idx] = createErrorResult(
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
