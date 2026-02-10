const MODULE_NAME = 'ContextDepthManager'

function isDebugMode() {
    if (typeof window !== 'undefined' && window.extensionSettings?.autoMultiImageSwipes?.debugMode) {
        return true
    }
    return false
}

const logger = {
    debug: (...args) => {
        if (isDebugMode()) {
            console.debug(`[${MODULE_NAME}]`, ...args)
        }
    },
    info: (...args) => console.info(`[${MODULE_NAME}]`, ...args),
    warn: (...args) => console.warn(`[${MODULE_NAME}]`, ...args),
    error: (...args) => console.error(`[${MODULE_NAME}]`, ...args),
}

/**
 * Manages context depth for chat history
 * Handles gathering and formatting chat messages for the summarizer
 */
export class ContextDepthManager {
    /**
     * Default configuration
     */
    static defaultConfig = {
        defaultDepth: 5,
        minDepth: 1,
        maxDepth: 10,
        maxContextLength: 2000,
    }

    /**
     * Creates a new ContextDepthManager instance
     * @param {Object} options - Configuration options
     * @param {number} [options.defaultDepth=5] - Default number of messages to include
     * @param {number} [options.minDepth=1] - Minimum allowed depth
     * @param {number} [options.maxDepth=10] - Maximum allowed depth
     * @param {number} [options.maxContextLength=2000] - Maximum context string length
     */
    constructor(options = {}) {
        this.minDepth = options.minDepth ?? ContextDepthManager.defaultConfig.minDepth
        this.maxDepth = options.maxDepth ?? ContextDepthManager.defaultConfig.maxDepth
        this.maxContextLength = options.maxContextLength ?? ContextDepthManager.defaultConfig.maxContextLength

        // Clamp default depth to valid range
        const requestedDepth = options.defaultDepth ?? ContextDepthManager.defaultConfig.defaultDepth
        this.defaultDepth = this._clampDepth(requestedDepth)

        logger.debug('Initialized with default depth:', this.defaultDepth)
    }

    /**
     * Clamp depth to valid range
     * @param {number} depth - Depth value to clamp
     * @returns {number} - Clamped depth value
     * @private
     */
    _clampDepth(depth) {
        const numDepth = Number(depth)
        if (Number.isNaN(numDepth)) {
            return this.defaultDepth ?? this.minDepth
        }
        return Math.max(this.minDepth, Math.min(this.maxDepth, numDepth))
    }

    /**
     * Get the last N messages from chat history
     * @param {Array} chat - Array of chat message objects
     * @param {number} [depth] - Number of messages to retrieve (uses default if not specified)
     * @returns {Array} - Array of message objects (new array, doesn't mutate original)
     */
    getContextMessages(chat, depth) {
        if (!chat || !Array.isArray(chat)) {
            logger.debug('Chat is null or not an array, returning empty')
            return []
        }

        const validMessages = chat.filter(msg => {
            if (!msg || typeof msg !== 'object') return false
            if (!msg.mes || typeof msg.mes !== 'string') return false
            return msg.mes.trim().length > 0
        })

        const numDepth = depth !== undefined ? Number(depth) : this.defaultDepth
        const isOutOfRange = Number.isNaN(numDepth) || numDepth < this.minDepth || numDepth > this.maxDepth

        if (isOutOfRange) {
            return validMessages
        }

        const startIndex = Math.max(0, validMessages.length - numDepth)
        const result = validMessages.slice(startIndex)

        logger.debug(`Retrieved ${result.length} messages (depth: ${numDepth})`)
        return result
    }

    /**
     * Format a single message for context
     * @param {Object} message - Message object with name and mes properties
     * @returns {string} - Formatted message string
     */
    formatMessageForContext(message) {
        // Handle null/undefined/non-object
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            return ''
        }

        // Handle missing mes
        if (!message.mes || typeof message.mes !== 'string') {
            return ''
        }

        // Strip HTML tags
        let content = message.mes.replace(/<[^>]*>/g, '')

        // Get name (optional)
        const name = message.name || ''

        // Format: "Name: content" or just "content" if no name
        let result
        if (name) {
            result = `${name}: ${content}`
        } else {
            result = content
        }

        // Clean up whitespace: trim and collapse multiple spaces
        result = result.trim().replace(/\s+/g, ' ')

        return result
    }

    /**
     * Format multiple messages into a context string for the summarizer
     * @param {Array} messages - Array of message objects
     * @returns {string} - Formatted context string
     */
    formatContextForPrompt(messages) {
        // Handle null/undefined/non-array
        if (!messages || !Array.isArray(messages)) {
            return ''
        }

        // Handle empty array
        if (messages.length === 0) {
            return ''
        }

        // Format each message and join with double newline
        const formattedMessages = messages.map(msg => this.formatMessageForContext(msg))
        let result = formattedMessages.join('\n\n')

        // Limit total length
        if (result.length > this.maxContextLength) {
            result = result.substring(0, this.maxContextLength)
            logger.debug(`Context truncated to ${this.maxContextLength} characters`)
        }

        return result
    }
}
