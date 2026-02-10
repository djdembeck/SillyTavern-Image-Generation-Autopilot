const DEFAULT_COMPLETION_EVENT_KEYS = Object.freeze([
    'SD_GENERATION_COMPLETE',
    'MESSAGE_RECEIVED',
])

const SUMMARIZER_EVENT_KEYS = Object.freeze([
    'SUMMARIZER_PROMPT_READY',
    'SD_GENERATION_COMPLETE',
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
        this.summarizerCallbacks = new Set()

        const useSummarizer = options.summarizerEnabled === true
        this.completedEventKeys = Array.isArray(options.completedEventKeys)
            ? options.completedEventKeys
            : (useSummarizer ? SUMMARIZER_EVENT_KEYS : DEFAULT_COMPLETION_EVENT_KEYS)

        this.messageHandler = this.messageHandler.bind(this)
        this.completeHandler = this.completeHandler.bind(this)
        this.summarizerHandler = this.summarizerHandler.bind(this)

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
            if (eventKey === 'SUMMARIZER_PROMPT_READY') {
                this.attachListener(eventKey, eventType, this.summarizerHandler)
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

    onSummarizerPrompt(callback) {
        if (typeof callback !== 'function') {
            return () => {}
        }
        this.summarizerCallbacks.add(callback)
        return () => this.summarizerCallbacks.delete(callback)
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

    emitSummarizerPrompt(payload) {
        this.summarizerCallbacks.forEach((callback) => {
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

    summarizerHandler(payload) {
        this.emitSummarizerPrompt({
            type: 'SUMMARIZER_PROMPT_READY',
            prompt: payload?.prompt,
            metadata: payload?.metadata,
        })
        this.emitCompletion({ type: 'SUMMARIZER_PROMPT_READY', payload })
    }

    dispose() {
        this.listeners.forEach(({ eventType, handler }) => {
            if (typeof this.eventSource.off === 'function') {
                this.eventSource.off(eventType, handler)
            }
        })
        this.listeners.clear()
        this.onCompleteCallbacks.clear()
        this.summarizerCallbacks.clear()
    }
}

export { GenerationDetector, DEFAULT_COMPLETION_EVENT_KEYS, SUMMARIZER_EVENT_KEYS }
