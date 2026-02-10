const MODULE_NAME = 'AvatarStorage'

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
const STORAGE_FIELD = 'avatarReferences'

/**
 * Validates if a string is a valid URL (http/https) or data URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 */
function isValidImageUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
        return false
    }

    // Check for data URL format
    if (url.startsWith('data:image/')) {
        return true
    }

    // Check for http/https URL
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}

/**
 * Validates avatar data against schema requirements
 * @param {Object} data - Avatar data to validate
 * @returns {Object|null} - Validated data with defaults, or null if invalid
 */
function validateAvatarData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        logger.debug('Invalid avatar data: not an object')
        return null
    }

    // Required fields
    if (!data.imageUrl || typeof data.imageUrl !== 'string') {
        logger.debug('Invalid avatar data: missing or invalid imageUrl')
        return null
    }

    if (!isValidImageUrl(data.imageUrl)) {
        logger.debug('Invalid avatar data: imageUrl is not a valid URL')
        return null
    }

    if (!data.characterId || typeof data.characterId !== 'string') {
        logger.debug('Invalid avatar data: missing or invalid characterId')
        return null
    }

    // Return validated data with defaults
    return {
        imageUrl: data.imageUrl,
        characterId: data.characterId,
        timestamp: typeof data.timestamp === 'number' && data.timestamp > 0
            ? data.timestamp
            : Date.now(),
    }
}

export class AvatarStorage {
    constructor(dependencies = {}) {
        this._avatars = new Map()
        this._context = dependencies.context || this._getDefaultContext()

        // Load existing avatars from extension field
        this._loadFromExtensionField()
    }

    /**
     * Get default context that works in browser environment
     * @returns {Object} - Context with read/write extension field methods
     */
    _getDefaultContext() {
        if (typeof window !== 'undefined' && window.SillyTavern?.getContext) {
            try {
                return window.SillyTavern.getContext()
            } catch (error) {
                logger.warn('Failed to get SillyTavern context:', error)
            }
        }

        // Fallback context for testing/development
        return {
            writeExtensionField: () => {},
            readExtensionField: () => null,
        }
    }

    /**
     * Load avatars from extension field storage
     */
    _loadFromExtensionField() {
        try {
            const stored = this._context.readExtensionField(EXTENSION_MODULE_NAME, STORAGE_FIELD)
            if (stored && typeof stored === 'object') {
                for (const [characterId, avatarData] of Object.entries(stored)) {
                    if (avatarData && typeof avatarData === 'object') {
                        this._avatars.set(characterId, { ...avatarData })
                    }
                }
                logger.debug(`Loaded ${this._avatars.size} avatars from extension field`)
            }
        } catch (error) {
            logger.error('Failed to load avatars from extension field:', error)
        }
    }

    /**
     * Persist avatars to extension field storage
     */
    _persistToExtensionField() {
        try {
            const dataToStore = {}
            for (const [characterId, avatarData] of this._avatars.entries()) {
                dataToStore[characterId] = { ...avatarData }
            }
            this._context.writeExtensionField(EXTENSION_MODULE_NAME, STORAGE_FIELD, dataToStore)
            logger.debug(`Persisted ${this._avatars.size} avatars to extension field`)
        } catch (error) {
            logger.error('Failed to persist avatars to extension field:', error)
        }
    }

    /**
     * Save avatar for a character
     * @param {string} characterId - Character ID
     * @param {Object} avatarData - Avatar data (imageUrl, characterId, timestamp optional)
     * @returns {boolean} - True if saved successfully
     */
    saveAvatar(characterId, avatarData) {
        if (!characterId || typeof characterId !== 'string') {
            logger.debug('saveAvatar failed: invalid characterId')
            return false
        }

        const validated = validateAvatarData(avatarData)
        if (!validated) {
            return false
        }

        // Ensure characterId in data matches the key
        validated.characterId = characterId

        this._avatars.set(characterId, validated)
        this._persistToExtensionField()

        logger.debug(`Saved avatar for character: ${characterId}`)
        return true
    }

    /**
     * Get avatar for a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} - Avatar data or null if not found
     */
    getAvatar(characterId) {
        if (!characterId || typeof characterId !== 'string') {
            return null
        }

        const avatar = this._avatars.get(characterId)
        if (!avatar) {
            return null
        }

        // Return a copy to prevent external mutation
        return { ...avatar }
    }

    /**
     * Update existing avatar partially
     * @param {string} characterId - Character ID
     * @param {Object} updates - Partial updates to apply
     * @returns {boolean} - True if updated successfully
     */
    updateAvatar(characterId, updates) {
        if (!characterId || typeof characterId !== 'string') {
            return false
        }

        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            return false
        }

        const existing = this._avatars.get(characterId)
        if (!existing) {
            return false
        }

        // Validate imageUrl if provided
        if (updates.imageUrl !== undefined) {
            if (!isValidImageUrl(updates.imageUrl)) {
                return false
            }
        }

        // Apply updates
        const updated = {
            ...existing,
            ...updates,
            characterId, // Ensure characterId cannot be changed
            timestamp: Date.now(), // Always update timestamp on modification
        }

        this._avatars.set(characterId, updated)
        this._persistToExtensionField()

        logger.debug(`Updated avatar for character: ${characterId}`)
        return true
    }

    /**
     * Delete avatar for a character
     * @param {string} characterId - Character ID
     * @returns {boolean} - True if deleted successfully
     */
    deleteAvatar(characterId) {
        if (!characterId || typeof characterId !== 'string') {
            return false
        }

        if (!this._avatars.has(characterId)) {
            return false
        }

        this._avatars.delete(characterId)
        this._persistToExtensionField()

        logger.debug(`Deleted avatar for character: ${characterId}`)
        return true
    }

    /**
     * List all stored avatars
     * @param {Object} options - Options for listing
     * @param {boolean} options.idsOnly - Return only character IDs
     * @returns {Array} - Array of avatar objects or character IDs
     */
    listAvatars(options = {}) {
        if (this._avatars.size === 0) {
            return []
        }

        if (options.idsOnly) {
            return Array.from(this._avatars.keys())
        }

        // Return copies of all avatar data
        return Array.from(this._avatars.values()).map(avatar => ({ ...avatar }))
    }

    /**
     * Clear all avatars (useful for testing)
     */
    clear() {
        this._avatars.clear()
        this._persistToExtensionField()
        logger.debug('Cleared all avatars')
    }

    /**
     * Get count of stored avatars
     * @returns {number} - Number of avatars stored
     */
    get count() {
        return this._avatars.size
    }
}
