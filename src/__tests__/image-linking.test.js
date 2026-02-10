import { describe, expect, it, beforeEach } from 'bun:test'
import { ImageLinker } from '../image-linking.js'

describe('ImageLinker', () => {
    let linker
    let mockContext

    beforeEach(() => {
        mockContext = {
            extensionFieldData: {},
            writeExtensionField: function (moduleName, field, data) {
                if (!this.extensionFieldData[moduleName]) {
                    this.extensionFieldData[moduleName] = {}
                }
                this.extensionFieldData[moduleName][field] = JSON.parse(JSON.stringify(data))
            },
            readExtensionField: function (moduleName, field) {
                return this.extensionFieldData[moduleName]?.[field] ?? null
            },
        }
        linker = new ImageLinker({ context: mockContext })
    })

    describe('schema validation', () => {
        it('requires imageUrl field', () => {
            const imageData = {
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(false)
        })

        it('requires chatId field', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(false)
        })

        it('automatically adds timestamp if not provided', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(true)
            const saved = linker.getLastImage('chat-123')
            expect(saved.timestamp).toBeGreaterThan(0)
        })

        it('stores all required schema fields', () => {
            const now = Date.now()
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: now,
            }

            linker.storeLastImage('chat-123', imageData)
            const saved = linker.getLastImage('chat-123')

            expect(saved.imageUrl).toBe('https://example.com/image.png')
            expect(saved.chatId).toBe('chat-123')
            expect(saved.timestamp).toBe(now)
        })

        it('accepts optional prompt field', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
                prompt: 'A beautiful sunset',
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(true)
            const saved = linker.getLastImage('chat-123')
            expect(saved.prompt).toBe('A beautiful sunset')
        })

        it('accepts optional provider field', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
                provider: 'nanogpt',
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(true)
            const saved = linker.getLastImage('chat-123')
            expect(saved.provider).toBe('nanogpt')
        })

        it('rejects invalid imageUrl format', () => {
            const imageData = {
                imageUrl: 'not-a-valid-url',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(false)
        })

        it('accepts data URL format for imageUrl', () => {
            const imageData = {
                imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(true)
        })
    })

    describe('storeLastImage', () => {
        it('saves image data for a chat', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('chat-123', imageData)

            expect(result).toBe(true)
        })

        it('rejects empty chatId', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            const result = linker.storeLastImage('', imageData)

            expect(result).toBe(false)
        })

        it('rejects null image data', () => {
            const result = linker.storeLastImage('chat-123', null)

            expect(result).toBe(false)
        })

        it('rejects non-object image data', () => {
            const result = linker.storeLastImage('chat-123', 'string-data')

            expect(result).toBe(false)
        })

        it('overwrites existing image for same chat', () => {
            const imageData1 = {
                imageUrl: 'https://example.com/image1.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            const imageData2 = {
                imageUrl: 'https://example.com/image2.png',
                chatId: 'chat-123',
                timestamp: Date.now() + 1000,
            }

            linker.storeLastImage('chat-123', imageData1)
            linker.storeLastImage('chat-123', imageData2)
            const saved = linker.getLastImage('chat-123')

            expect(saved.imageUrl).toBe('https://example.com/image2.png')
        })
    })

    describe('getLastImage', () => {
        it('retrieves saved image for chat', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            linker.storeLastImage('chat-123', imageData)

            const result = linker.getLastImage('chat-123')

            expect(result).toEqual(imageData)
        })

        it('returns null for non-existent chat', () => {
            const result = linker.getLastImage('non-existent')

            expect(result).toBeNull()
        })

        it('returns null for empty chatId', () => {
            const result = linker.getLastImage('')

            expect(result).toBeNull()
        })
    })

    describe('hasLastImage', () => {
        it('returns true when chat has a stored image', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            linker.storeLastImage('chat-123', imageData)

            const result = linker.hasLastImage('chat-123')

            expect(result).toBe(true)
        })

        it('returns false when chat has no stored image', () => {
            const result = linker.hasLastImage('chat-123')

            expect(result).toBe(false)
        })

        it('returns false for empty chatId', () => {
            const result = linker.hasLastImage('')

            expect(result).toBe(false)
        })
    })

    describe('deleteLastImage', () => {
        it('deletes image for chat', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            linker.storeLastImage('chat-123', imageData)

            const result = linker.deleteLastImage('chat-123')

            expect(result).toBe(true)
            expect(linker.getLastImage('chat-123')).toBeNull()
        })

        it('returns false for non-existent chat', () => {
            const result = linker.deleteLastImage('non-existent')

            expect(result).toBe(false)
        })

        it('returns false for empty chatId', () => {
            const result = linker.deleteLastImage('')

            expect(result).toBe(false)
        })
    })

    describe('getLinkableImage', () => {
        it('returns image data formatted for linking', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
                prompt: 'Original prompt',
            }
            linker.storeLastImage('chat-123', imageData)

            const result = linker.getLinkableImage('chat-123')

            expect(result).not.toBeNull()
            expect(result.imageUrl).toBe('https://example.com/image.png')
        })

        it('returns null when no image exists', () => {
            const result = linker.getLinkableImage('chat-123')

            expect(result).toBeNull()
        })

        it('includes isLinkable flag set to true', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            linker.storeLastImage('chat-123', imageData)

            const result = linker.getLinkableImage('chat-123')

            expect(result.isLinkable).toBe(true)
        })
    })

    describe('listLinkedImages', () => {
        it('returns empty array when no images stored', () => {
            const result = linker.listLinkedImages()

            expect(result).toEqual([])
        })

        it('returns array of all stored images', () => {
            const image1 = {
                imageUrl: 'https://example.com/image1.png',
                chatId: 'chat-1',
                timestamp: Date.now(),
            }
            const image2 = {
                imageUrl: 'https://example.com/image2.png',
                chatId: 'chat-2',
                timestamp: Date.now() + 1000,
            }
            linker.storeLastImage('chat-1', image1)
            linker.storeLastImage('chat-2', image2)

            const result = linker.listLinkedImages()

            expect(result).toHaveLength(2)
            expect(result).toContainEqual(image1)
            expect(result).toContainEqual(image2)
        })

        it('returns array of chat IDs when idsOnly option is true', () => {
            linker.storeLastImage('chat-1', {
                imageUrl: 'https://example.com/image1.png',
                chatId: 'chat-1',
                timestamp: Date.now(),
            })
            linker.storeLastImage('chat-2', {
                imageUrl: 'https://example.com/image2.png',
                chatId: 'chat-2',
                timestamp: Date.now(),
            })

            const result = linker.listLinkedImages({ idsOnly: true })

            expect(result).toContain('chat-1')
            expect(result).toContain('chat-2')
            expect(result).toHaveLength(2)
            expect(typeof result[0]).toBe('string')
        })
    })

    describe('persistence to extension field', () => {
        it('persists images to extension field on store', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }

            linker.storeLastImage('chat-123', imageData)

            const persisted = mockContext.readExtensionField(
                'AutoMultiImageSwipes',
                'linkedImages'
            )
            expect(persisted).toBeDefined()
            expect(persisted['chat-123']).toEqual(imageData)
        })

        it('loads images from extension field on initialization', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            mockContext.writeExtensionField('AutoMultiImageSwipes', 'linkedImages', {
                'chat-123': imageData,
            })

            const newLinker = new ImageLinker({ context: mockContext })

            expect(newLinker.getLastImage('chat-123')).toEqual(imageData)
        })

        it('persists deletion to extension field', () => {
            const imageData = {
                imageUrl: 'https://example.com/image.png',
                chatId: 'chat-123',
                timestamp: Date.now(),
            }
            linker.storeLastImage('chat-123', imageData)
            linker.deleteLastImage('chat-123')

            const persisted = mockContext.readExtensionField(
                'AutoMultiImageSwipes',
                'linkedImages'
            )
            expect(persisted['chat-123']).toBeUndefined()
        })
    })

    describe('dependency injection', () => {
        it('accepts context via constructor', () => {
            const customContext = {
                extensionFieldData: {},
                writeExtensionField: function () {},
                readExtensionField: function () {
                    return null
                },
            }

            const customLinker = new ImageLinker({ context: customContext })

            expect(customLinker).toBeDefined()
        })

        it('uses default context when none provided', () => {
            const linkerWithDefaults = new ImageLinker()

            expect(linkerWithDefaults).toBeDefined()
        })
    })

    describe('integration - link with previous image', () => {
        it('stores and retrieves image for linking flow', () => {
            const chatId = 'chat-abc'
            const imageData = {
                imageUrl: 'https://example.com/generated.png',
                chatId: chatId,
                timestamp: Date.now(),
                prompt: 'A scenic mountain view',
                provider: 'nanogpt',
            }

            const storeResult = linker.storeLastImage(chatId, imageData)
            const hasImage = linker.hasLastImage(chatId)
            const linkableData = linker.getLinkableImage(chatId)

            expect(storeResult).toBe(true)
            expect(hasImage).toBe(true)
            expect(linkableData).not.toBeNull()
            expect(linkableData.imageUrl).toBe('https://example.com/generated.png')
        })

        it('maintains separate images per chat', () => {
            linker.storeLastImage('chat-1', {
                imageUrl: 'https://example.com/image1.png',
                chatId: 'chat-1',
                timestamp: Date.now(),
            })
            linker.storeLastImage('chat-2', {
                imageUrl: 'https://example.com/image2.png',
                chatId: 'chat-2',
                timestamp: Date.now(),
            })

            expect(linker.getLastImage('chat-1').imageUrl).toBe('https://example.com/image1.png')
            expect(linker.getLastImage('chat-2').imageUrl).toBe('https://example.com/image2.png')
        })
    })
})
