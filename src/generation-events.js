const DEFAULT_COMPLETION_EVENT_KEYS = Object.freeze([
    'SD_GENERATION_COMPLETE',
    'MESSAGE_RECEIVED',
])

class GenerationDetector {
    constructor(eventSource, eventTypes, options = {}) {
        if (!eventSource || typeof eventSource.on !== 'function') {
            throw new Error('GenerationDetector requires an eventSource with on/off')
        }
        if (!eventTypes || typeof eventTypes !== 'object') {
            throw new Error('GenerationDetector requires eventTypes')
        }

        this.eventSource = eventSource
        this.eventTypes = eventTypes
        this.onCompleteCallbacks = new Set()
        this.listeners = new Map()
        this.completedEventKeys = Array.isArray(options.completedEventKeys)
            ? options.completedEventKeys
            : DEFAULT_COMPLETION_EVENT_KEYS

        this.messageHandler = this.messageHandler.bind(this)
        this.completeHandler = this.completeHandler.bind(this)

        this.subscribe()
    }

    subscribe() {
        this.completedEventKeys.forEach((eventKey) => {
            const eventType = this.eventTypes[eventKey]
            if (!eventType) {
                return
            }
            if (eventKey === 'MESSAGE_RECEIVED') {
                this.attachListener(eventKey, eventType, this.messageHandler)
                return
            }
            this.attachListener(eventKey, eventType, this.completeHandler)
        })
    }

    attachListener(eventKey, eventType, handler) {
        const listener = this.listeners.get(eventKey)
        if (listener) {
            return
        }
        this.listeners.set(eventKey, { eventType, handler })
        this.eventSource.on(eventType, handler)
    }

    onComplete(callback) {
        if (typeof callback !== 'function') {
            return () => {}
        }
        this.onCompleteCallbacks.add(callback)
        return () => this.onCompleteCallbacks.delete(callback)
    }

    emitCompletion(payload) {
        this.onCompleteCallbacks.forEach((callback) => {
            try {
                callback(payload)
            } catch (error) {
                // ignore callback errors to avoid breaking listeners
            }
        })
    }

    messageHandler(message) {
        if (!message || message.source !== 'extension') {
            return
        }
        this.emitCompletion({ type: 'MESSAGE_RECEIVED', message })
    }

    completeHandler(payload) {
        this.emitCompletion({ type: 'SD_GENERATION_COMPLETE', payload })
    }

    dispose() {
        this.listeners.forEach(({ eventType, handler }) => {
            if (typeof this.eventSource.off === 'function') {
                this.eventSource.off(eventType, handler)
            }
        })
        this.listeners.clear()
        this.onCompleteCallbacks.clear()
    }
}

export { GenerationDetector }
