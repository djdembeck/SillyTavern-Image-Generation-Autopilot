import { describe, it, beforeEach, afterEach } from 'bun:test'
import './jest-setup.js'
import { GalleryStorage } from '../gallery-storage.js'

describe('GalleryStorage', () => {
    let storage
    let mockIndexedDB
    let mockDB
    let mockObjectStore
    let mockTransaction

    beforeEach(() => {
        // Mock IndexedDB
        mockObjectStore = {
            add: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            getAll: jest.fn(),
            clear: jest.fn(),
            createIndex: jest.fn(),
        }

        mockTransaction = {
            objectStore: jest.fn(() => mockObjectStore),
            oncomplete: null,
            onerror: null,
        }

        mockDB = {
            createObjectStore: jest.fn(() => mockObjectStore),
            transaction: jest.fn(() => mockTransaction),
            objectStoreNames: {
                contains: jest.fn(() => false),
            },
            close: jest.fn(),
        }

        mockIndexedDB = {
            open: jest.fn(() => {
                const request = {
                    result: mockDB,
                    onsuccess: null,
                    onerror: null,
                    onupgradeneeded: null,
                }
                // Simulate async open
                setTimeout(() => {
                    if (request.onupgradeneeded) {
                        request.onupgradeneeded({ target: request })
                    }
                    if (request.onsuccess) {
                        request.onsuccess({ target: request })
                    }
                }, 0)
                return request
            }),
            deleteDatabase: jest.fn(),
        }

        storage = new GalleryStorage({
            indexedDB: mockIndexedDB,
            dbName: 'TestGalleryDB',
            storeName: 'images',
        })
    })

    afterEach(() => {
        if (storage) {
            storage.close()
        }
    })

    describe('IndexedDB schema', () => {
        it('opens database with correct name and version', async () => {
            await storage.init()

            expect(mockIndexedDB.open).toHaveBeenCalledWith('TestGalleryDB', 1)
        })

        it('creates object store with auto-increment key', async () => {
            await storage.init()

            expect(mockDB.createObjectStore).toHaveBeenCalledWith('images', {
                keyPath: 'id',
                autoIncrement: true,
            })
        })

        it('creates index on timestamp field', async () => {
            await storage.init()

            expect(mockObjectStore.createIndex).toHaveBeenCalledWith(
                'timestamp',
                'timestamp',
                { unique: false }
            )
        })

        it('creates index on provider field', async () => {
            await storage.init()

            expect(mockObjectStore.createIndex).toHaveBeenCalledWith(
                'provider',
                'provider',
                { unique: false }
            )
        })

        it('creates index on prompt field for text search', async () => {
            await storage.init()

            expect(mockObjectStore.createIndex).toHaveBeenCalledWith(
                'prompt',
                'prompt',
                { unique: false }
            )
        })
    })

    describe('saveImage', () => {
        it('saves image blob with metadata', async () => {
            await storage.init()
            const imageBlob = new Blob(['test-image-data'], { type: 'image/png' })
            const metadata = {
                timestamp: Date.now(),
                provider: 'nanogpt',
                prompt: 'A beautiful sunset',
            }

            mockObjectStore.add.mockImplementation((data) => {
                data.id = 1
                return { result: 1 }
            })

            const result = await storage.saveImage(imageBlob, metadata)

            expect(result).toBeGreaterThan(0)
            expect(mockObjectStore.add).toHaveBeenCalledWith(
                expect.objectContaining({
                    imageBlob: expect.any(Blob),
                    timestamp: metadata.timestamp,
                    provider: metadata.provider,
                    prompt: metadata.prompt,
                })
            )
        })

        it('auto-generates timestamp if not provided', async () => {
            await storage.init()
            const imageBlob = new Blob(['test-image-data'], { type: 'image/png' })
            const metadata = {
                provider: 'pollinations',
                prompt: 'A mountain landscape',
            }

            const beforeSave = Date.now()
            mockObjectStore.add.mockImplementation((data) => {
                data.id = 1
                return { result: 1 }
            })

            await storage.saveImage(imageBlob, metadata)
            const afterSave = Date.now()

            const callArg = mockObjectStore.add.mock.calls[0][0]
            expect(callArg.timestamp).toBeGreaterThanOrEqual(beforeSave)
            expect(callArg.timestamp).toBeLessThanOrEqual(afterSave)
        })

        it('rejects null image blob', async () => {
            await storage.init()
            const metadata = {
                provider: 'nanogpt',
                prompt: 'Test prompt',
            }

            await expect(storage.saveImage(null, metadata)).rejects.toThrow('Image blob is required')
        })

        it('rejects non-blob image data', async () => {
            await storage.init()
            const metadata = {
                provider: 'nanogpt',
                prompt: 'Test prompt',
            }

            await expect(storage.saveImage('not-a-blob', metadata)).rejects.toThrow('Image blob is required')
        })

        it('rejects metadata without prompt', async () => {
            await storage.init()
            const imageBlob = new Blob(['test'], { type: 'image/png' })
            const metadata = {
                provider: 'nanogpt',
            }

            await expect(storage.saveImage(imageBlob, metadata)).rejects.toThrow('Prompt is required')
        })

        it('allows empty provider field', async () => {
            await storage.init()
            const imageBlob = new Blob(['test'], { type: 'image/png' })
            const metadata = {
                prompt: 'Test prompt',
            }

            mockObjectStore.add.mockImplementation((data) => {
                data.id = 1
                return { result: 1 }
            })

            const result = await storage.saveImage(imageBlob, metadata)
            expect(result).toBeGreaterThan(0)
        })
    })

    describe('getImage', () => {
        it('retrieves image by id', async () => {
            await storage.init()
            const mockImageData = {
                id: 1,
                imageBlob: new Blob(['test-data'], { type: 'image/png' }),
                timestamp: Date.now(),
                provider: 'nanogpt',
                prompt: 'A beautiful sunset',
            }

            mockObjectStore.get.mockImplementation((id) => {
                return { result: mockImageData }
            })

            const result = await storage.getImage(1)

            expect(result).toEqual(mockImageData)
            expect(mockObjectStore.get).toHaveBeenCalledWith(1)
        })

        it('returns null for non-existent id', async () => {
            await storage.init()

            mockObjectStore.get.mockImplementation((id) => {
                return { result: undefined }
            })

            const result = await storage.getImage(999)

            expect(result).toBeNull()
        })

        it('rejects invalid id types', async () => {
            await storage.init()

            await expect(storage.getImage(null)).rejects.toThrow('Invalid image id')
            await expect(storage.getImage('string')).rejects.toThrow('Invalid image id')
            await expect(storage.getImage(-1)).rejects.toThrow('Invalid image id')
        })
    })

    describe('deleteImage', () => {
        it('deletes image by id', async () => {
            await storage.init()

            mockObjectStore.delete.mockImplementation((id) => {
                return { result: undefined }
            })

            const result = await storage.deleteImage(1)

            expect(result).toBe(true)
            expect(mockObjectStore.delete).toHaveBeenCalledWith(1)
        })

        it('returns false for non-existent id', async () => {
            await storage.init()

            mockObjectStore.delete.mockImplementation((id) => {
                const error = new Error('Not found')
                throw error
            })

            const result = await storage.deleteImage(999)

            expect(result).toBe(false)
        })

        it('rejects invalid id types', async () => {
            await storage.init()

            await expect(storage.deleteImage(null)).rejects.toThrow('Invalid image id')
            await expect(storage.deleteImage('string')).rejects.toThrow('Invalid image id')
        })
    })

    describe('listImages', () => {
        it('returns all images when no options provided', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 1' },
                { id: 2, timestamp: Date.now(), provider: 'pollinations', prompt: 'Image 2' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.listImages()

            expect(result).toHaveLength(2)
            expect(result).toEqual(mockImages)
        })

        it('filters by provider when specified', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 1' },
                { id: 2, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 2' },
                { id: 3, timestamp: Date.now(), provider: 'pollinations', prompt: 'Image 3' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.listImages({ provider: 'nanogpt' })

            expect(result).toHaveLength(2)
            expect(result.every((img) => img.provider === 'nanogpt')).toBe(true)
        })

        it('limits results when limit option provided', async () => {
            await storage.init()
            const mockImages = Array.from({ length: 10 }, (_, i) => ({
                id: i + 1,
                timestamp: Date.now() - i * 1000,
                provider: 'nanogpt',
                prompt: `Image ${i + 1}`,
            }))

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.listImages({ limit: 5 })

            expect(result).toHaveLength(5)
        })

        it('sorts by timestamp descending by default', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: 1000, provider: 'nanogpt', prompt: 'Oldest' },
                { id: 2, timestamp: 3000, provider: 'nanogpt', prompt: 'Newest' },
                { id: 3, timestamp: 2000, provider: 'nanogpt', prompt: 'Middle' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.listImages()

            expect(result[0].id).toBe(2) // Newest first
            expect(result[1].id).toBe(3)
            expect(result[2].id).toBe(1)
        })

        it('sorts by timestamp ascending when specified', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: 1000, provider: 'nanogpt', prompt: 'Oldest' },
                { id: 2, timestamp: 3000, provider: 'nanogpt', prompt: 'Newest' },
                { id: 3, timestamp: 2000, provider: 'nanogpt', prompt: 'Middle' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.listImages({ sortOrder: 'asc' })

            expect(result[0].id).toBe(1) // Oldest first
            expect(result[1].id).toBe(3)
            expect(result[2].id).toBe(2)
        })

        it('returns empty array when no images exist', async () => {
            await storage.init()

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: [] }
            })

            const result = await storage.listImages()

            expect(result).toEqual([])
        })

        it('filters by date range when startDate provided', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: new Date('2024-01-01').getTime(), provider: 'nanogpt', prompt: 'Old' },
                { id: 2, timestamp: new Date('2024-06-01').getTime(), provider: 'nanogpt', prompt: 'Mid' },
                { id: 3, timestamp: new Date('2024-12-01').getTime(), provider: 'nanogpt', prompt: 'New' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const startDate = new Date('2024-05-01').getTime()
            const result = await storage.listImages({ startDate })

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(3)
            expect(result[1].id).toBe(2)
        })

        it('filters by date range when endDate provided', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: new Date('2024-01-01').getTime(), provider: 'nanogpt', prompt: 'Old' },
                { id: 2, timestamp: new Date('2024-06-01').getTime(), provider: 'nanogpt', prompt: 'Mid' },
                { id: 3, timestamp: new Date('2024-12-01').getTime(), provider: 'nanogpt', prompt: 'New' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const endDate = new Date('2024-07-01').getTime()
            const result = await storage.listImages({ endDate })

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(2)
            expect(result[1].id).toBe(1)
        })
    })

    describe('clearGallery', () => {
        it('deletes all images from storage', async () => {
            await storage.init()

            mockObjectStore.clear.mockImplementation(() => {
                return { result: undefined }
            })

            const result = await storage.clearGallery()

            expect(result).toBe(true)
            expect(mockObjectStore.clear).toHaveBeenCalled()
        })

        it('returns false if clear fails', async () => {
            await storage.init()

            mockObjectStore.clear.mockImplementation(() => {
                throw new Error('Clear failed')
            })

            const result = await storage.clearGallery()

            expect(result).toBe(false)
        })
    })

    describe('searchImages', () => {
        it('searches images by prompt text', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'A beautiful sunset over mountains' },
                { id: 2, timestamp: Date.now(), provider: 'nanogpt', prompt: 'A cat playing in the garden' },
                { id: 3, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Sunset at the beach' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.searchImages('sunset')

            expect(result).toHaveLength(2)
            expect(result.some((img) => img.id === 1)).toBe(true)
            expect(result.some((img) => img.id === 3)).toBe(true)
        })

        it('performs case-insensitive search', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'A BEAUTIFUL Sunset' },
                { id: 2, timestamp: Date.now(), provider: 'nanogpt', prompt: 'a beautiful sunset' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.searchImages('beautiful')

            expect(result).toHaveLength(2)
        })

        it('returns empty array when no matches found', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'A mountain landscape' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.searchImages('ocean')

            expect(result).toEqual([])
        })

        it('rejects empty search query', async () => {
            await storage.init()

            await expect(storage.searchImages('')).rejects.toThrow('Search query is required')
            await expect(storage.searchImages(null)).rejects.toThrow('Search query is required')
        })
    })

    describe('getImageCount', () => {
        it('returns total count of stored images', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 1' },
                { id: 2, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 2' },
                { id: 3, timestamp: Date.now(), provider: 'pollinations', prompt: 'Image 3' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.getImageCount()

            expect(result).toBe(3)
        })

        it('returns count for specific provider', async () => {
            await storage.init()
            const mockImages = [
                { id: 1, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 1' },
                { id: 2, timestamp: Date.now(), provider: 'nanogpt', prompt: 'Image 2' },
                { id: 3, timestamp: Date.now(), provider: 'pollinations', prompt: 'Image 3' },
            ]

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: mockImages }
            })

            const result = await storage.getImageCount({ provider: 'nanogpt' })

            expect(result).toBe(2)
        })

        it('returns 0 when no images exist', async () => {
            await storage.init()

            mockObjectStore.getAll.mockImplementation(() => {
                return { result: [] }
            })

            const result = await storage.getImageCount()

            expect(result).toBe(0)
        })
    })

    describe('metadata schema', () => {
        it('stores all required metadata fields', async () => {
            await storage.init()
            const imageBlob = new Blob(['test'], { type: 'image/png' })
            const metadata = {
                timestamp: 1234567890,
                provider: 'openrouter',
                prompt: 'A detailed prompt description',
            }

            mockObjectStore.add.mockImplementation((data) => {
                data.id = 1
                return { result: 1 }
            })

            await storage.saveImage(imageBlob, metadata)

            const saved = mockObjectStore.add.mock.calls[0][0]
            expect(saved.timestamp).toBe(metadata.timestamp)
            expect(saved.provider).toBe(metadata.provider)
            expect(saved.prompt).toBe(metadata.prompt)
        })

        it('preserves additional metadata fields', async () => {
            await storage.init()
            const imageBlob = new Blob(['test'], { type: 'image/png' })
            const metadata = {
                timestamp: Date.now(),
                provider: 'nanogpt',
                prompt: 'Test',
                model: 'z-image-turbo',
                seed: 12345,
                width: 1024,
                height: 1024,
            }

            mockObjectStore.add.mockImplementation((data) => {
                data.id = 1
                return { result: 1 }
            })

            await storage.saveImage(imageBlob, metadata)

            const saved = mockObjectStore.add.mock.calls[0][0]
            expect(saved.model).toBe('z-image-turbo')
            expect(saved.seed).toBe(12345)
            expect(saved.width).toBe(1024)
            expect(saved.height).toBe(1024)
        })
    })

    describe('dependency injection', () => {
        it('accepts IndexedDB instance via constructor', () => {
            const customDB = { open: jest.fn() }

            const customStorage = new GalleryStorage({
                indexedDB: customDB,
                dbName: 'CustomDB',
            })

            expect(customStorage).toBeDefined()
        })

        it('uses default IndexedDB when not provided', () => {
            const storageWithDefaults = new GalleryStorage({
                dbName: 'DefaultDB',
            })

            expect(storageWithDefaults).toBeDefined()
        })

        it('uses default database name when not provided', () => {
            const storageWithDefaults = new GalleryStorage()

            expect(storageWithDefaults).toBeDefined()
        })
    })

    describe('error handling', () => {
        it('handles database open errors', async () => {
            mockIndexedDB.open.mockImplementation(() => {
                const request = {
                    onsuccess: null,
                    onerror: null,
                }
                setTimeout(() => {
                    if (request.onerror) {
                        request.onerror({ target: { error: new Error('DB open failed') } })
                    }
                }, 0)
                return request
            })

            await expect(storage.init()).rejects.toThrow('DB open failed')
        })

        it('handles transaction errors', async () => {
            await storage.init()

            mockDB.transaction.mockImplementation(() => {
                throw new Error('Transaction failed')
            })

            await expect(storage.getImage(1)).rejects.toThrow('Transaction failed')
        })

        it('handles store operation errors', async () => {
            await storage.init()

            mockObjectStore.get.mockImplementation(() => {
                const error = new Error('Store operation failed')
                throw error
            })

            await expect(storage.getImage(1)).rejects.toThrow('Store operation failed')
        })
    })

    describe('close', () => {
        it('closes database connection', async () => {
            await storage.init()

            mockDB.close = jest.fn()

            storage.close()

            expect(mockDB.close).toHaveBeenCalled()
        })

        it('handles close when database not initialized', () => {
            expect(() => storage.close()).not.toThrow()
        })
    })
})
