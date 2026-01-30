import { describe, expect, it, beforeEach } from 'bun:test'
import { GenerationDetector } from '../generation-events.js'

function createEventSource() {
    const listeners = new Map()
    return {
        on(eventType, handler) {
            if (!listeners.has(eventType)) {
                listeners.set(eventType, new Set())
            }
            listeners.get(eventType).add(handler)
        },
        off(eventType, handler) {
            listeners.get(eventType)?.delete(handler)
        },
        emit(eventType, payload) {
            listeners.get(eventType)?.forEach((handler) => handler(payload))
        },
        listenerCount(eventType) {
            return listeners.get(eventType)?.size || 0
        },
    }
}

const eventTypes = {
    MESSAGE_RECEIVED: 'message_received',
    SD_GENERATION_COMPLETE: 'sd_generation_complete',
}

describe('GenerationDetector', () => {
    let eventSource

    beforeEach(() => {
        eventSource = createEventSource()
    })

    it('subscribes to MESSAGE_RECEIVED on initialization', () => {
        new GenerationDetector(eventSource, eventTypes)
        expect(eventSource.listenerCount(eventTypes.MESSAGE_RECEIVED)).toBe(1)
    })

    it('fires callback when MESSAGE_RECEIVED comes from extension', () => {
        const detector = new GenerationDetector(eventSource, eventTypes)
        const calls = []
        detector.onComplete((payload) => calls.push(payload))

        eventSource.emit(eventTypes.MESSAGE_RECEIVED, {
            source: 'extension',
            message: 'ok',
        })

        expect(calls).toHaveLength(1)
        expect(calls[0].type).toBe('MESSAGE_RECEIVED')
    })

    it('ignores MESSAGE_RECEIVED when source is not extension', () => {
        const detector = new GenerationDetector(eventSource, eventTypes)
        const calls = []
        detector.onComplete((payload) => calls.push(payload))

        eventSource.emit(eventTypes.MESSAGE_RECEIVED, {
            source: 'user',
            message: 'ignored',
        })

        expect(calls).toHaveLength(0)
    })

    it('unsubscribes handlers on dispose', () => {
        const detector = new GenerationDetector(eventSource, eventTypes)
        detector.dispose()
        expect(eventSource.listenerCount(eventTypes.MESSAGE_RECEIVED)).toBe(0)
    })
})
