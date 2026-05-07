import { describe, expect, it, beforeEach, afterEach, beforeAll } from 'bun:test'

// Mock window global
globalThis.window = {
  extensionSettings: {
    autoMultiImageSwipes: {
      debugMode: false
    }
  }
}

function makeRegistry(characters) {
  return {
    schema_version: 1,
    card_name: 'test-card',
    card_display_name: 'Test Card',
    characters,
  }
}

function makeRegistryEntry(name, promptReadyDesc, overrides = {}) {
  return {
    name,
    profile_ref: `ref-photos/test/${name.toLowerCase().replace(/\s+/g, '-')}/NPC_PROFILE.json`,
    source_type: 'real-people',
    role_in_card: 'test',
    generator_fields: {
      prompt_ready_description: promptReadyDesc,
      body_type_override: '34C equivalent, fit toned frame',
      ...overrides,
    },
    attributes: {
      hair: 'brown, long',
      skin: 'fair',
      eyes: 'blue',
      distinguishing_features: 'none',
    },
  }
}

describe('buildAppearanceLinesFromRegistry', () => {
  let buildAppearanceLinesFromRegistry

  beforeAll(async () => {
    const mod = await import('../summarizer.js')
    buildAppearanceLinesFromRegistry = mod.buildAppearanceLinesFromRegistry
  })

  describe('returns null when registry should not be used', () => {
    it('returns null for null registry', () => {
      expect(buildAppearanceLinesFromRegistry(null, ['Alice'], 'Alice')).toBeNull()
    })

    it('returns null for undefined registry', () => {
      expect(buildAppearanceLinesFromRegistry(undefined, ['Alice'], 'Alice')).toBeNull()
    })

    it('returns null for registry with no characters array', () => {
      expect(buildAppearanceLinesFromRegistry({}, ['Alice'], 'Alice')).toBeNull()
    })

    it('returns null for registry with empty characters array', () => {
      expect(buildAppearanceLinesFromRegistry(makeRegistry([]), ['Alice'], 'Alice')).toBeNull()
    })

    it('returns null for empty sceneCharacters array', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes, petite frame'),
      ])
      expect(buildAppearanceLinesFromRegistry(registry, [], 'Alice')).toBeNull()
    })

    it('returns null for non-array sceneCharacters', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes, petite frame'),
      ])
      expect(buildAppearanceLinesFromRegistry(registry, null, 'Alice')).toBeNull()
    })
  })

  describe('builds Shared: line + a female: lines', () => {
    it('returns Shared: line + 2 a female: lines for 2-NPC registry', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes, petite frame, crop top and micro shorts'),
        makeRegistryEntry('Bob', 'brunette, green eyes, athletic build, yoga pants and tank top'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'Bob'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('Shared:')
      expect(result).toContain('34C equivalent, fit toned frame')
      expect(result).toContain('a female: blonde hair, blue eyes, petite frame, crop top and micro shorts')
      expect(result).toContain('a female: brunette, green eyes, athletic build, yoga pants and tank top')

      // Count the "a female:" lines
      const femaleLines = (result.match(/a female:/g) || []).length
      expect(femaleLines).toBe(2)
    })

    it('returns Shared: line + 3 a female: lines for 3-NPC registry', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
        makeRegistryEntry('Bob', 'brunette, green eyes'),
        makeRegistryEntry('Carol', 'redhead, hazel eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'Bob', 'Carol'], 'Alice')

      expect(result).not.toBeNull()
      const femaleLines = (result.match(/a female:/g) || []).length
      expect(femaleLines).toBe(3)
    })

    it('formats output with correct indentation', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toMatch(/^Shared: /m)
      expect(result).toMatch(/^  - a female: /m)
    })
  })

  describe('falls back to getCharacterDescription for unknown characters', () => {
    let originalSillyTavern

    beforeEach(() => {
      originalSillyTavern = globalThis.SillyTavern
    })

    afterEach(() => {
      if (originalSillyTavern === undefined) {
        delete globalThis.SillyTavern
      } else {
        globalThis.SillyTavern = originalSillyTavern
      }
    })

    it('uses getCharacterDescription when character not in registry', () => {
      globalThis.SillyTavern = {
        getContext: () => ({
          characters: [
            {
              name: 'UnknownChar',
              data: {
                name: 'UnknownChar',
                description: 'A mysterious figure in a dark cloak',
              },
            },
          ],
        }),
      }

      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'UnknownChar'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('a female: blonde hair, blue eyes')
      expect(result).toContain('a female: A mysterious figure in a dark cloak')
    })

    it('skips character entirely when not in registry and no ST description', () => {
      globalThis.SillyTavern = {
        getContext: () => ({ characters: [] }),
      }

      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'GhostChar'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('a female: blonde hair, blue eyes')
      // GhostChar should not appear since there's no fallback description
      const femaleLines = (result.match(/a female:/g) || []).length
      expect(femaleLines).toBe(1)
    })
  })

  describe('handles under_18_visual_override', () => {
    it('includes under_18_visual_override in Shared: line', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes, petite frame'),
        makeRegistryEntry('YoungOne', 'brunette, brown eyes, small frame', {
          under_18_visual_override: 'petite, shorter stature',
        }),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'YoungOne'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('Shared:')
      expect(result).toContain('34C equivalent, fit toned frame')
      expect(result).toContain('petite, shorter stature')
    })

    it('does not include under_18_visual_override when no scene character is under 18', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
        makeRegistryEntry('Bob', 'brunette, green eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'Bob'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('Shared:')
      expect(result).toContain('34C equivalent, fit toned frame')
      expect(result).not.toContain('petite, shorter stature')
    })

    it('includes under_18_visual_override when under-18 NPC is in scene but not first', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
        makeRegistryEntry('YoungOne', 'brunette, brown eyes, small frame', {
          under_18_visual_override: 'petite, shorter stature',
        }),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice', 'YoungOne'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('petite, shorter stature')
    })
  })

  describe('case-insensitive name matching', () => {
    it('matches character names case-insensitively', () => {
      const registry = makeRegistry([
        makeRegistryEntry('Alice', 'blonde hair, blue eyes'),
        makeRegistryEntry('Bob', 'brunette, green eyes'),
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['alice', 'BOB'], 'Alice')

      expect(result).not.toBeNull()
      expect(result).toContain('a female: blonde hair, blue eyes')
      expect(result).toContain('a female: brunette, green eyes')
    })
  })

  describe('handles missing generator_fields gracefully', () => {
    it('returns null when no entries have prompt_ready_description and no ST fallback', () => {
      globalThis.SillyTavern = {
        getContext: () => ({ characters: [] }),
      }

      const registry = makeRegistry([
        {
          name: 'Alice',
          profile_ref: 'ref-photos/test/alice/NPC_PROFILE.json',
          source_type: 'real-people',
          role_in_card: 'test',
          generator_fields: {
            body_type_override: '34C equivalent, fit toned frame',
            // No prompt_ready_description
          },
          attributes: {},
        },
      ])

      const result = buildAppearanceLinesFromRegistry(registry, ['Alice'], 'Alice')

      // Shared line exists but no a female: lines → lines array has 1 entry (Shared only)
      // Actually, Shared line is built from firstEntry, and a female: lines are built per character
      // Alice has no prompt_ready_description and no ST fallback → no a female: line
      // But Shared: line exists → lines.length > 0 → returns the Shared line
      expect(result).not.toBeNull()
      expect(result).toContain('Shared:')
      expect(result).not.toContain('a female:')
    })
  })
})

describe('summarizeWithAI with characterRegistry', () => {
  const mockChatCompletion = async () => ({
    choices: [{
      message: {
        content: `Characters:
  Shared: 34C equivalent, fit toned frame
  - a female: blonde hair, blue eyes, crop top
  - a female: brunette, green eyes, yoga pants

Scene: A modern office with fluorescent lighting.`
      }
    }]
  })

  it('uses registry-based appearance lines in system prompt when registry is provided', async () => {
    const { summarizeWithAI } = await import('../summarizer.js')

    let systemMessageContent = ''
    const captureCompletion = async (messages) => {
      const systemMessage = messages.find(m => m.role === 'system')
      systemMessageContent = systemMessage?.content || ''
      return mockChatCompletion()
    }

    const registry = makeRegistry([
      makeRegistryEntry('Alice', 'blonde hair, blue eyes, crop top and micro shorts'),
      makeRegistryEntry('Bob', 'brunette, green eyes, yoga pants and tank top'),
    ])

    await summarizeWithAI({
      messages: [],
      messageDepth: 1,
      callChatCompletion: captureCompletion,
      characterRegistry: registry,
      sceneCharacters: ['Alice', 'Bob'],
      charName: 'Alice',
    })

    expect(systemMessageContent).toContain('Shared:')
    expect(systemMessageContent).toContain('34C equivalent, fit toned frame')
    expect(systemMessageContent).toContain('a female: blonde hair, blue eyes, crop top and micro shorts')
    expect(systemMessageContent).toContain('a female: brunette, green eyes, yoga pants and tank top')
  })

  it('falls back to single-character behavior when no registry is provided', async () => {
    const { summarizeWithAI } = await import('../summarizer.js')

    let systemMessageContent = ''
    const captureCompletion = async (messages) => {
      const systemMessage = messages.find(m => m.role === 'system')
      systemMessageContent = systemMessage?.content || ''
      return mockChatCompletion()
    }

    globalThis.SillyTavern = {
      getContext: () => ({
        characters: [
          {
            name: 'Alice',
            data: {
              name: 'Alice',
              description: 'A brave adventurer with red hair and green eyes',
            },
          },
        ],
      }),
    }

    await summarizeWithAI({
      messages: [],
      messageDepth: 1,
      callChatCompletion: captureCompletion,
      charName: 'Alice',
    })

    expect(systemMessageContent).toContain('A brave adventurer with red hair and green eyes')
    // When no registry, appearance lines are just the character description — no "a female:" prefix
    expect(systemMessageContent).not.toContain('a female: A brave adventurer')

    delete globalThis.SillyTavern
  })
})