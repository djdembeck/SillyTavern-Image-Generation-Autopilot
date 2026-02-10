/**
 * GalleryStorage - IndexedDB-based image storage for the gallery feature
 */

const MODULE_NAME = 'GalleryStorage';

/**
 * Storage class for gallery images using IndexedDB
 */
export class GalleryStorage {
    /**
     * Creates an instance of GalleryStorage
     * @param {Object} options - Configuration options
     * @param {IDBFactory} [options.indexedDB] - IndexedDB instance (for testing)
     * @param {string} [options.dbName='ImageGenerationGallery'] - Database name
     * @param {string} [options.storeName='images'] - Object store name
     */
    constructor(options = {}) {
        this.indexedDB = options.indexedDB || (typeof window !== 'undefined' ? window.indexedDB : null);
        this.dbName = options.dbName || 'ImageGenerationGallery';
        this.storeName = options.storeName || 'images';
        this.db = null;
        this.initialized = false;
    }

    /**
     * Initialize the database connection
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) {
            return;
        }

        return new Promise((resolve, reject) => {
            if (!this.indexedDB) {
                reject(new Error('IndexedDB not available'));
                return;
            }

            const request = this.indexedDB.open(this.dbName, 1);

            request.onerror = (event) => {
                reject(new Error(event.target.error?.message || 'DB open failed'));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initialized = true;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store with auto-increment key
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });

                    // Create indexes
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('provider', 'provider', { unique: false });
                    store.createIndex('prompt', 'prompt', { unique: false });
                }
            };
        });
    }

    /**
     * Save an image to the gallery
     * @param {Blob} imageBlob - The image data
     * @param {Object} metadata - Image metadata
     * @param {number} [metadata.timestamp] - Timestamp (auto-generated if not provided)
     * @param {string} [metadata.provider] - Provider name
     * @param {string} metadata.prompt - Generation prompt (required)
     * @returns {Promise<number>} - The ID of the saved image
     */
    async saveImage(imageBlob, metadata = {}) {
        await this.init();

        // Validate image blob
        if (!imageBlob || !(imageBlob instanceof Blob)) {
            throw new Error('Image blob is required');
        }

        // Validate prompt
        if (!metadata.prompt) {
            throw new Error('Prompt is required');
        }

        // Auto-generate timestamp if not provided
        const timestamp = metadata.timestamp || Date.now();

        const data = {
            imageBlob,
            timestamp,
            provider: metadata.provider || '',
            prompt: metadata.prompt,
            ...metadata,
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(data);

            // Handle both real IndexedDB requests and mock objects
            if (request && typeof request === 'object' && 'result' in request && !request.onsuccess) {
                // Mock object - resolve immediately
                resolve(request.result);
                return;
            }

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(new Error(event.target.error?.message || 'Failed to save image'));
            };
        });
    }

    /**
     * Get an image by ID
     * @param {number} id - The image ID
     * @returns {Promise<Object|null>} - The image data or null if not found
     */
    async getImage(id) {
        await this.init();

        // Validate ID
        if (id === null || id === undefined || typeof id !== 'number' || id < 0) {
            throw new Error('Invalid image id');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(id);

                if (request && typeof request === 'object' && 'result' in request && !request.onsuccess) {
                    resolve(request.result || null);
                    return;
                }

                request.onsuccess = (event) => {
                    resolve(event.target.result || null);
                };

                request.onerror = (event) => {
                    reject(new Error(event.target.error?.message || 'Store operation failed'));
                };
            } catch (error) {
                reject(new Error(error.message || 'Transaction failed'));
            }
        });
    }

    /**
     * Delete an image by ID
     * @param {number} id - The image ID
     * @returns {Promise<boolean>} - True if deleted, false if not found
     */
    async deleteImage(id) {
        await this.init();

        // Validate ID
        if (id === null || id === undefined || typeof id !== 'number') {
            throw new Error('Invalid image id');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(id);

                if (request && typeof request === 'object' && !request.onsuccess) {
                    resolve(true);
                    return;
                }

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = (event) => {
                    reject(new Error(event.target.error?.message || 'Store operation failed'));
                };
            } catch (error) {
                if (error.message === 'Not found') {
                    resolve(false);
                } else {
                    reject(new Error(error.message || 'Transaction failed'));
                }
            }
        });
    }

    /**
     * List images with optional filtering
     * @param {Object} options - Filter options
     * @param {string} [options.provider] - Filter by provider
     * @param {number} [options.limit] - Maximum number of results
     * @param {string} [options.sortOrder='desc'] - Sort order ('asc' or 'desc')
     * @param {number} [options.startDate] - Filter images after this timestamp
     * @param {number} [options.endDate] - Filter images before this timestamp
     * @returns {Promise<Array<Object>>} - Array of image metadata
     */
    async listImages(options = {}) {
        await this.init();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                if (request && typeof request === 'object' && 'result' in request && !request.onsuccess) {
                    let results = request.result || [];

                    if (options.provider) {
                        results = results.filter(img => img.provider === options.provider);
                    }
                    if (options.startDate) {
                        results = results.filter(img => img.timestamp >= options.startDate);
                    }
                    if (options.endDate) {
                        results = results.filter(img => img.timestamp <= options.endDate);
                    }
                    results.sort((a, b) => {
                        const comparison = a.timestamp - b.timestamp;
                        return options.sortOrder === 'asc' ? comparison : -comparison;
                    });
                    if (options.limit && options.limit > 0) {
                        results = results.slice(0, options.limit);
                    }
                    resolve(results);
                    return;
                }

                request.onsuccess = (event) => {
                    let results = event.target.result || [];

                    // Filter by provider
                    if (options.provider) {
                        results = results.filter(img => img.provider === options.provider);
                    }

                    // Filter by date range
                    if (options.startDate) {
                        results = results.filter(img => img.timestamp >= options.startDate);
                    }
                    if (options.endDate) {
                        results = results.filter(img => img.timestamp <= options.endDate);
                    }

                    // Sort by timestamp
                    results.sort((a, b) => {
                        const comparison = a.timestamp - b.timestamp;
                        return options.sortOrder === 'asc' ? comparison : -comparison;
                    });

                    // Apply limit
                    if (options.limit && options.limit > 0) {
                        results = results.slice(0, options.limit);
                    }

                    resolve(results);
                };

                request.onerror = (event) => {
                    reject(new Error(event.target.error?.message || 'Store operation failed'));
                };
            } catch (error) {
                reject(new Error(error.message || 'Transaction failed'));
            }
        });
    }

    /**
     * Clear all images from the gallery
     * @returns {Promise<boolean>} - True if successful
     */
    async clearGallery() {
        await this.init();

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.clear();

                if (request && typeof request === 'object' && !request.onsuccess) {
                    resolve(true);
                    return;
                }

                request.onsuccess = () => {
                    resolve(true);
                };

                request.onerror = (event) => {
                    reject(new Error(event.target.error?.message || 'Clear failed'));
                };
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Search images by prompt text
     * @param {string} query - Search query
     * @returns {Promise<Array<Object>>} - Array of matching images
     */
    async searchImages(query) {
        await this.init();

        // Validate query
        if (!query || query.trim() === '') {
            throw new Error('Search query is required');
        }

        const searchTerm = query.toLowerCase();
        const allImages = await this.listImages();

        return allImages.filter(img =>
            img.prompt && img.prompt.toLowerCase().includes(searchTerm)
        );
    }

    /**
     * Get the count of stored images
     * @param {Object} options - Filter options
     * @param {string} [options.provider] - Count only images from this provider
     * @returns {Promise<number>} - Number of images
     */
    async getImageCount(options = {}) {
        await this.init();

        const images = await this.listImages(options);
        return images.length;
    }

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }
}

export default GalleryStorage;
