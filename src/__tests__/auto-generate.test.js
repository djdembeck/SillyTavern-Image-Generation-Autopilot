import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const indexSource = readFileSync(
    resolve(import.meta.dir, '../../index.js'),
    'utf8',
)

function extractFunctionSource(functionName, nextFunctionName) {
    const pattern = new RegExp(
        `async function ${functionName}\\([^)]*\\) {([\\s\\S]*?)}\\s*async function ${nextFunctionName}\\(`,
    )
    const match = indexSource.match(pattern)
    if (!match) {
        throw new Error(`Could not locate ${functionName}() in index.js`)
    }
    return match[0]
}

const handleIncomingMessageSource = extractFunctionSource(
    'handleIncomingMessage',
    'handleManualPromptRewrite',
)

describe('Auto-generate integration with summarizer', () => {
    it('imports summarizeWithAI into index.js', () => {
        expect(indexSource).toContain(
            "import { summarizeWithAI } from './src/summarizer.js'",
        )
    })

    it('calls summarizeWithAI from handleIncomingMessage', () => {
        expect(handleIncomingMessageSource).toContain('await summarizeWithAI({')
    })

    it('passes message context, depth, names, and settings to summarizeWithAI', () => {
        expect(handleIncomingMessageSource).toContain('messages: summarizerMessages')
        expect(handleIncomingMessageSource).toContain('messageDepth')
        expect(handleIncomingMessageSource).toContain('settings: summarizerSettings')
        expect(handleIncomingMessageSource).toContain('charName')
        expect(handleIncomingMessageSource).toContain('userName')
    })

    it('builds summarizer message context using configured message depth', () => {
        expect(handleIncomingMessageSource).toContain(
            '.slice(Math.max(0, resolvedId - messageDepth + 1), resolvedId + 1)',
        )
    })

    it('does not call regex extraction in auto-generate flow', () => {
        expect(handleIncomingMessageSource).not.toContain('getPicPromptMatches(')
    })

    it('passes summarized prompt into the dialog flow', () => {
        expect(handleIncomingMessageSource).toContain(
            'const prompt = summarizedPrompt.trim()',
        )
        expect(handleIncomingMessageSource).toContain('expandedPrompts.push(prompt)')
        expect(handleIncomingMessageSource).toContain('openImageSelectionDialog(')
    })

    it('wraps summarizer call in error handling', () => {
        expect(handleIncomingMessageSource).toMatch(
            /try\s*{[^]*await summarizeWithAI\({[^]*}\s*catch \(error\) {[^]*logger\.error.*Auto-generation summarizer failed/,
        )
    })
})
