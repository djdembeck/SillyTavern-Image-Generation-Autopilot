import { describe, expect, it } from 'bun:test'
import { ParallelGenerator } from '../parallel-generator.js'

function createDeferred() {
    let resolve
    let reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

function waitForTick() {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ParallelGenerator', () => {
    it('respects the concurrency limit', async () => {
        const deferreds = []
        let running = 0
        let maxRunning = 0
        let callCount = 0

        const callSdSlash = () => {
            callCount += 1
            running += 1
            maxRunning = Math.max(maxRunning, running)
            const deferred = createDeferred()
            deferreds.push(deferred)
            return deferred.promise.finally(() => {
                running -= 1
            })
        }

        const generator = new ParallelGenerator({
            concurrencyLimit: 2,
            callSdSlash,
        })

        const runPromise = generator.run(['a', 'b', 'c', 'd'])

        await waitForTick()
        expect(callCount).toBe(2)
        expect(maxRunning).toBe(2)

        deferreds[0].resolve('one')
        deferreds[1].resolve('two')

        await waitForTick()
        expect(callCount).toBe(4)
        expect(maxRunning).toBe(2)

        deferreds[2].resolve('three')
        deferreds[3].resolve('four')

        const results = await runPromise
        expect(results).toHaveLength(4)
        expect(results.every((result) => result.status === 'ok')).toBe(true)
    })

    it('runs multiple workers in parallel', async () => {
        const deferreds = []
        let running = 0
        let maxRunning = 0

        const callSdSlash = () => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            const deferred = createDeferred()
            deferreds.push(deferred)
            return deferred.promise.finally(() => {
                running -= 1
            })
        }

        const generator = new ParallelGenerator({
            concurrencyLimit: 3,
            callSdSlash,
        })

        const runPromise = generator.run(['one', 'two', 'three'])

        await waitForTick()
        expect(maxRunning).toBe(3)
        expect(running).toBe(3)

        deferreds.forEach((deferred, index) => {
            deferred.resolve(`done-${index}`)
        })

        const results = await runPromise
        expect(results.map((result) => result.status)).toEqual(['ok', 'ok', 'ok'])
    })

    it('cycles through model queue entries', async () => {
        const modelsByPrompt = new Map()

        const callSdSlash = (prompt, _quiet, modelId) => {
            modelsByPrompt.set(prompt, modelId)
            return Promise.resolve({ ok: true })
        }

        const generator = new ParallelGenerator({
            concurrencyLimit: 3,
            callSdSlash,
        })

        await generator.run(
            [
                { prompt: 'alpha' },
                { prompt: 'bravo' },
                { prompt: 'charlie', modelId: 'override' },
                { prompt: 'delta' },
            ],
            {
                modelQueue: [
                    { id: 'm1', count: 1 },
                    { id: 'm2', count: 2 },
                ],
            },
        )

        expect(modelsByPrompt.get('alpha')).toBe('m1')
        expect(modelsByPrompt.get('bravo')).toBe('m2')
        expect(modelsByPrompt.get('charlie')).toBe('override')
        expect(modelsByPrompt.get('delta')).toBe('m1')
    })

    it('continues after failures and reports errors', async () => {
        const callSdSlash = (prompt) => {
            if (prompt === 'bad') {
                throw new Error('boom')
            }
            if (prompt === 'null') {
                return null
            }
            return { ok: true }
        }

        const generator = new ParallelGenerator({
            concurrencyLimit: 2,
            callSdSlash,
        })

        const results = await generator.run(['good', 'bad', 'null'])

        expect(results).toHaveLength(3)
        expect(results[0].status).toBe('ok')
        expect(results[1].status).toBe('error')
        expect(results[1].error.message).toBe('boom')
        expect(results[2].status).toBe('error')
        expect(results[2].error.message).toBe('SD generation failed')
    })

    it('marks remaining work as aborted', async () => {
        const deferreds = []
        let callCount = 0

        const callSdSlash = () => {
            callCount += 1
            const deferred = createDeferred()
            deferreds.push(deferred)
            return deferred.promise
        }

        const generator = new ParallelGenerator({
            concurrencyLimit: 2,
            callSdSlash,
        })

        const runPromise = generator.run(['one', 'two', 'three', 'four'])

        await waitForTick()
        expect(callCount).toBe(2)

        generator.abort()

        deferreds[0].resolve('done-1')
        deferreds[1].resolve('done-2')

        const results = await runPromise
        expect(callCount).toBe(2)
        expect(results[0].status).toBe('ok')
        expect(results[1].status).toBe('ok')
        expect(results[2].status).toBe('error')
        expect(results[2].error.message).toBe('aborted')
        expect(results[3].status).toBe('error')
        expect(results[3].error.message).toBe('aborted')
    })
})
