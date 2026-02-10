import { describe, expect, it, beforeEach } from 'bun:test'
import { AvatarStorage } from '../avatar-storage.js'

describe('AvatarStorage', () => {
    let storage
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
        storage = new AvatarStorage({ context: mockContext })
    })

    describe('avatar schema', () => {
        it('requires imageUrl field', () => {
            const avatarData = {
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(false)
        })

        it('requires characterId field', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(false)
        })

        it('automatically adds timestamp if not provided', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(true)
            const saved = storage.getAvatar('char-123')
            expect(saved.timestamp).toBeGreaterThan(0)
        })

        it('stores all required schema fields', () => {
            const now = Date.now()
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: now,
            }

            storage.saveAvatar('char-123', avatarData)
            const saved = storage.getAvatar('char-123')

            expect(saved.imageUrl).toBe('https://example.com/avatar.png')
            expect(saved.characterId).toBe('char-123')
            expect(saved.timestamp).toBe(now)
        })

        it('rejects invalid imageUrl format', () => {
            const avatarData = {
                imageUrl: 'not-a-valid-url',
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(false)
        })

        it('accepts data URL format for imageUrl', () => {
            const avatarData = {
                imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(true)
        })
    })

    describe('saveAvatar', () => {
        it('saves avatar data for a character', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('char-123', avatarData)

            expect(result).toBe(true)
        })

        it('rejects empty characterId', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            const result = storage.saveAvatar('', avatarData)

            expect(result).toBe(false)
        })

        it('rejects null avatar data', () => {
            const result = storage.saveAvatar('char-123', null)

            expect(result).toBe(false)
        })

        it('rejects non-object avatar data', () => {
            const result = storage.saveAvatar('char-123', 'string-data')

            expect(result).toBe(false)
        })

        it('overwrites existing avatar for same character', () => {
            const avatarData1 = {
                imageUrl: 'https://example.com/avatar1.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            const avatarData2 = {
                imageUrl: 'https://example.com/avatar2.png',
                characterId: 'char-123',
                timestamp: Date.now() + 1000,
            }

            storage.saveAvatar('char-123', avatarData1)
            storage.saveAvatar('char-123', avatarData2)
            const saved = storage.getAvatar('char-123')

            expect(saved.imageUrl).toBe('https://example.com/avatar2.png')
        })
    })

    describe('getAvatar', () => {
        it('retrieves saved avatar for character', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)

            const result = storage.getAvatar('char-123')

            expect(result).toEqual(avatarData)
        })

        it('returns null for non-existent character', () => {
            const result = storage.getAvatar('non-existent')

            expect(result).toBeNull()
        })

        it('returns null for empty characterId', () => {
            const result = storage.getAvatar('')

            expect(result).toBeNull()
        })
    })

    describe('updateAvatar', () => {
        it('updates existing avatar partially', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)

            const result = storage.updateAvatar('char-123', {
                imageUrl: 'https://example.com/updated.png',
            })

            expect(result).toBe(true)
            const saved = storage.getAvatar('char-123')
            expect(saved.imageUrl).toBe('https://example.com/updated.png')
            expect(saved.characterId).toBe('char-123')
        })

        it('returns false for non-existent character', () => {
            const result = storage.updateAvatar('non-existent', {
                imageUrl: 'https://example.com/updated.png',
            })

            expect(result).toBe(false)
        })

        it('rejects empty characterId', () => {
            const result = storage.updateAvatar('', {
                imageUrl: 'https://example.com/updated.png',
            })

            expect(result).toBe(false)
        })

        it('rejects null update data', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)

            const result = storage.updateAvatar('char-123', null)

            expect(result).toBe(false)
        })

        it('updates timestamp on modification', () => {
            const originalTime = Date.now() - 10000
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: originalTime,
            }
            storage.saveAvatar('char-123', avatarData)

            storage.updateAvatar('char-123', { imageUrl: 'https://example.com/updated.png' })
            const saved = storage.getAvatar('char-123')

            expect(saved.timestamp).toBeGreaterThan(originalTime)
        })
    })

    describe('deleteAvatar', () => {
        it('deletes avatar for character', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)

            const result = storage.deleteAvatar('char-123')

            expect(result).toBe(true)
            expect(storage.getAvatar('char-123')).toBeNull()
        })

        it('returns false for non-existent character', () => {
            const result = storage.deleteAvatar('non-existent')

            expect(result).toBe(false)
        })

        it('returns false for empty characterId', () => {
            const result = storage.deleteAvatar('')

            expect(result).toBe(false)
        })
    })

    describe('listAvatars', () => {
        it('returns empty array when no avatars stored', () => {
            const result = storage.listAvatars()

            expect(result).toEqual([])
        })

        it('returns array of all stored avatars', () => {
            const avatar1 = {
                imageUrl: 'https://example.com/avatar1.png',
                characterId: 'char-1',
                timestamp: Date.now(),
            }
            const avatar2 = {
                imageUrl: 'https://example.com/avatar2.png',
                characterId: 'char-2',
                timestamp: Date.now() + 1000,
            }
            storage.saveAvatar('char-1', avatar1)
            storage.saveAvatar('char-2', avatar2)

            const result = storage.listAvatars()

            expect(result).toHaveLength(2)
            expect(result).toContainEqual(avatar1)
            expect(result).toContainEqual(avatar2)
        })

        it('returns array of character IDs when idsOnly option is true', () => {
            storage.saveAvatar('char-1', {
                imageUrl: 'https://example.com/avatar1.png',
                characterId: 'char-1',
                timestamp: Date.now(),
            })
            storage.saveAvatar('char-2', {
                imageUrl: 'https://example.com/avatar2.png',
                characterId: 'char-2',
                timestamp: Date.now(),
            })

            const result = storage.listAvatars({ idsOnly: true })

            expect(result).toContain('char-1')
            expect(result).toContain('char-2')
            expect(result).toHaveLength(2)
            expect(typeof result[0]).toBe('string')
        })
    })

    describe('persistence to extension field', () => {
        it('persists avatars to extension field on save', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }

            storage.saveAvatar('char-123', avatarData)

            const persisted = mockContext.readExtensionField(
                'AutoMultiImageSwipes',
                'avatarReferences'
            )
            expect(persisted).toBeDefined()
            expect(persisted['char-123']).toEqual(avatarData)
        })

        it('loads avatars from extension field on initialization', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            mockContext.writeExtensionField('AutoMultiImageSwipes', 'avatarReferences', {
                'char-123': avatarData,
            })

            const newStorage = new AvatarStorage({ context: mockContext })

            expect(newStorage.getAvatar('char-123')).toEqual(avatarData)
        })

        it('persists deletion to extension field', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)
            storage.deleteAvatar('char-123')

            const persisted = mockContext.readExtensionField(
                'AutoMultiImageSwipes',
                'avatarReferences'
            )
            expect(persisted['char-123']).toBeUndefined()
        })

        it('persists updates to extension field', () => {
            const avatarData = {
                imageUrl: 'https://example.com/avatar.png',
                characterId: 'char-123',
                timestamp: Date.now(),
            }
            storage.saveAvatar('char-123', avatarData)
            storage.updateAvatar('char-123', { imageUrl: 'https://example.com/updated.png' })

            const persisted = mockContext.readExtensionField(
                'AutoMultiImageSwipes',
                'avatarReferences'
            )
            expect(persisted['char-123'].imageUrl).toBe('https://example.com/updated.png')
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

            const customStorage = new AvatarStorage({ context: customContext })

            expect(customStorage).toBeDefined()
        })

        it('uses default context when none provided', () => {
            const storageWithDefaults = new AvatarStorage()

            expect(storageWithDefaults).toBeDefined()
        })
    })
})
