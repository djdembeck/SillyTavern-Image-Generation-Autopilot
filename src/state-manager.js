export class StateManager {
    constructor({ generationStates, runningMessages, seenMessages, chatToken } = {}) {
        this.generationStates =
            generationStates && typeof generationStates === 'object'
                ? generationStates
                : {}
        this.runningMessages =
            runningMessages instanceof Map ? runningMessages : new Map()
        this.seenMessages = seenMessages instanceof Set ? seenMessages : new Set()
        this.chatToken = Number.isFinite(chatToken) ? chatToken : 0
    }

    cleanup() {
        if (!this.generationStates || typeof this.generationStates !== 'object') {
            this.generationStates = {}
        } else {
            for (const key of Object.keys(this.generationStates)) {
                delete this.generationStates[key]
            }
        }

        if (this.runningMessages?.clear) {
            this.runningMessages.clear()
        } else {
            this.runningMessages = new Map()
        }

        if (this.seenMessages?.clear) {
            this.seenMessages.clear()
        } else {
            this.seenMessages = new Set()
        }
    }

    resetForChat(chatToken) {
        if (!Number.isFinite(chatToken)) {
            this.chatToken += 1
            this.cleanup()
            return true
        }

        if (chatToken === this.chatToken) {
            return false
        }

        this.chatToken = chatToken
        this.cleanup()
        return true
    }

    addGenerationState(key, data) {
        if (typeof key !== 'string' || !key.trim()) {
            return false
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return false
        }

        if (!this.generationStates || typeof this.generationStates !== 'object') {
            this.generationStates = {}
        }

        this.generationStates[key] = data
        return true
    }

    getGenerationState(key) {
        if (!this.generationStates || typeof this.generationStates !== 'object') {
            return undefined
        }
        return this.generationStates[key]
    }

    removeGenerationState(key) {
        if (typeof key !== 'string' || !key.trim()) {
            return false
        }

        if (!this.generationStates || typeof this.generationStates !== 'object') {
            return false
        }

        if (!Object.prototype.hasOwnProperty.call(this.generationStates, key)) {
            return false
        }

        delete this.generationStates[key]
        return true
    }
}
