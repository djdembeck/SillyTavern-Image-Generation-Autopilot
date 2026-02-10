const MODULE_NAME = 'ImageLinker'

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

const EXTENSION_MODULE_NAME = 'AutoMultiImageSwipes'
const STORAGE_FIELD = 'linkedImages'

function isValidImageUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
        return false
    }

    if (url.startsWith('data:image/')) {
        return true
    }

    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

function validateImageData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        logger.debug('Invalid image data: not an object')
        return null
    }

    if (!data.imageUrl || typeof data.imageUrl !== 'string') {
        logger.debug('Invalid image data: missing or invalid imageUrl')
        return null
    }

    if (!isValidImageUrl(data.imageUrl)) {
        logger.debug('Invalid image data: imageUrl is not a valid URL')
        return null
    }

    if (!data.chatId || typeof data.chatId !== 'string') {
        logger.debug('Invalid image data: missing or invalid chatId')
        return null
    }

    const validated = {
        imageUrl: data.imageUrl,
        chatId: data.chatId,
        timestamp: typeof data.timestamp === 'number' && data.timestamp > 0
            ? data.timestamp
            : Date.now(),
    }

    if (data.prompt && typeof data.prompt === 'string') {
        validated.prompt = data.prompt
    }

    if (data.provider && typeof data.provider === 'string') {
        validated.provider = data.provider
    }

    return validated
}

export class ImageLinker {
    constructor(dependencies = {}) {
        this._images = new Map()
        this._context = dependencies.context || this._getDefaultContext()

        this._loadFromExtensionField()
    }

    _getDefaultContext() {
        if (typeof window !== 'undefined' && window.SillyTavern?.getContext) {
            try {
                return window.SillyTavern.getContext()
            } catch (error) {
                logger.warn('Failed to get SillyTavern context:', error)
            }
        }

        return {
            writeExtensionField: () => {},
            readExtensionField: () => null,
        }
    }

    _loadFromExtensionField() {
        try {
            const stored = this._context.readExtensionField(EXTENSION_MODULE_NAME, STORAGE_FIELD)
            if (stored && typeof stored === 'object') {
                for (const [chatId, imageData] of Object.entries(stored)) {
                    if (imageData && typeof imageData === 'object') {
                        this._images.set(chatId, { ...imageData })
                    }
                }
                logger.debug(`Loaded ${this._images.size} linked images from extension field`)
            }
        } catch (error) {
            logger.error('Failed to load linked images from extension field:', error)
        }
    }

    _persistToExtensionField() {
        try {
            const dataToStore = {}
            for (const [chatId, imageData] of this._images.entries()) {
                dataToStore[chatId] = { ...imageData }
            }
            this._context.writeExtensionField(EXTENSION_MODULE_NAME, STORAGE_FIELD, dataToStore)
            logger.debug(`Persisted ${this._images.size} linked images to extension field`)
        } catch (error) {
            logger.error('Failed to persist linked images to extension field:', error)
        }
    }

    storeLastImage(chatId, imageData) {
        if (!chatId || typeof chatId !== 'string') {
            logger.debug('storeLastImage failed: invalid chatId')
            return false
        }

        const validated = validateImageData(imageData)
        if (!validated) {
            return false
        }

        validated.chatId = chatId

        this._images.set(chatId, validated)
        this._persistToExtensionField()

        logger.debug(`Stored last image for chat: ${chatId}`)
        return true
    }

    getLastImage(chatId) {
        if (!chatId || typeof chatId !== 'string') {
            return null
        }

        const image = this._images.get(chatId)
        if (!image) {
            return null
        }

        return { ...image }
    }

    hasLastImage(chatId) {
        if (!chatId || typeof chatId !== 'string') {
            return false
        }

        return this._images.has(chatId)
    }

    deleteLastImage(chatId) {
        if (!chatId || typeof chatId !== 'string') {
            return false
        }

        if (!this._images.has(chatId)) {
            return false
        }

        this._images.delete(chatId)
        this._persistToExtensionField()

        logger.debug(`Deleted last image for chat: ${chatId}`)
        return true
    }

    getLinkableImage(chatId) {
        const image = this.getLastImage(chatId)
        if (!image) {
            return null
        }

        return {
            ...image,
            isLinkable: true,
        }
    }

    listLinkedImages(options = {}) {
        if (this._images.size === 0) {
            return []
        }

        if (options.idsOnly) {
            return Array.from(this._images.keys())
        }

        return Array.from(this._images.values()).map(image => ({ ...image }))
    }

    clear() {
        this._images.clear()
        this._persistToExtensionField()
        logger.debug('Cleared all linked images')
    }

    get count() {
        return this._images.size
    }
}
