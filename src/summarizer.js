const MODULE_NAME = 'Summarizer';

function isDebugMode() {
  if (typeof window !== 'undefined' && window.extensionSettings?.autoMultiImageSwipes?.debugMode) {
    return true;
  }
  return false;
}

const logger = {
  debug: (...args) => {
    if (isDebugMode()) {
      console.debug(`[${MODULE_NAME}]`, ...args);
    }
  },
  info: (...args) => console.info(`[${MODULE_NAME}]`, ...args),
  warn: (...args) => console.warn(`[${MODULE_NAME}]`, ...args),
  error: (...args) => console.error(`[${MODULE_NAME}]`, ...args),
};

const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `You are an expert at creating detailed image generation prompts from roleplay scenarios.

Character Appearance:
{{APPEARANCE_LINES}}

Your task is to analyze the recent conversation and create a comprehensive image generation prompt that captures:
1. The characters present and their current state
2. The scene setting, atmosphere, and mood
3. Visual details that would make a compelling image

Output Format:
{{OUTPUT_FORMAT_LINES}}`;

const OUTPUT_FORMAT_LINES = [
  'Characters:',
  '- [Character Name]: [Brief description of appearance, pose, expression, clothing]',
  '',
  'Scene: [Detailed description of the environment, lighting, camera angle, style]',
].join('\n');

function getSillyTavernContext() {
  if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
    return SillyTavern.getContext();
  }

  if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
    return window.SillyTavern.getContext();
  }

  return null;
}

/**
 * Retrieves a character's description from SillyTavern character data.
 * Character name lookup is case-insensitive (e.g., 'Alice' will match 'alice' or 'ALICE').
 * Supports both array format (newer SillyTavern) and object format (older versions).
 * @param {string} charName - Character name to look up
 * @returns {string} Character description or empty string if not found
 */
export function getCharacterDescription(charName) {
  if (!charName || typeof charName !== 'string') {
    return '';
  }

  const ctx = getSillyTavernContext();
  if (!ctx?.characters) {
    return '';
  }

  const needle = String(charName).trim().toLowerCase();

  // Handle array format (newer SillyTavern versions)
  if (Array.isArray(ctx.characters)) {
    const char = ctx.characters.find((c) => {
      const label = c?.data?.name || c?.name || c?.data?.displayName;
      return label && String(label).trim().toLowerCase() === needle;
    });

    if (char) {
      const description = char?.data?.description || char?.description || '';
      return typeof description === 'string' ? description.trim() : '';
    }

    return '';
  }

  // Handle object format (older SillyTavern versions or keyed by name)
  if (ctx.characters[charName]) {
    const char = ctx.characters[charName];
    const description = char?.data?.description || char?.description || '';
    return typeof description === 'string' ? description.trim() : '';
  }

  // Try case-insensitive lookup on object keys
  for (const key of Object.keys(ctx.characters)) {
    if (key.toLowerCase() === needle) {
      const char = ctx.characters[key];
      const description = char?.data?.description || char?.description || '';
      return typeof description === 'string' ? description.trim() : '';
    }
  }

  return '';
}

function normalizeResponseContent(result) {
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (typeof result === 'string' && result.trim()) {
    return result.trim();
  }

  const candidates = [
    result?.text,
    result?.message,
    result?.message?.content,
    result?.content,
    result?.reply,
    result?.output,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function buildSystemPrompt(systemPromptTemplate, appearanceLines) {
  return systemPromptTemplate
    .replace('{{APPEARANCE_LINES}}', appearanceLines)
    .replace('{{OUTPUT_FORMAT_LINES}}', OUTPUT_FORMAT_LINES);
}

function selectMessages(messages, messageDepth) {
  const normalizedDepth = Math.min(Math.max(Number.parseInt(messageDepth, 10) || 1, 1), 10);
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.slice(-normalizedDepth).map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof message?.content === 'string' ? message.content : '',
  }));
}

function buildInvocationConfig(inputOrText, charName, userName, settings) {
  if (inputOrText && typeof inputOrText === 'object' && !Array.isArray(inputOrText)) {
    const systemPromptTemplate = inputOrText.systemPromptTemplate
      || inputOrText.settings?.summarizer?.systemPromptTemplate
      || DEFAULT_SYSTEM_PROMPT_TEMPLATE;

    return {
      messages: selectMessages(inputOrText.messages, inputOrText.messageDepth),
      callChatCompletion: inputOrText.callChatCompletion,
      systemPromptTemplate,
      characterDescriptions: inputOrText.characterDescriptions || {},
      charName: inputOrText.charName || '',
      userName: inputOrText.userName || '',
    };
  }

  const summarizerSettings = settings?.summarizer || settings?.autoGeneration?.summarizer || {};
  const rawMessages = [{ role: 'user', content: typeof inputOrText === 'string' ? inputOrText : '' }];

  return {
    messages: selectMessages(rawMessages, summarizerSettings.messageDepth || 1),
    callChatCompletion: null,
    systemPromptTemplate: summarizerSettings.systemPromptTemplate || DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    characterDescriptions: {},
    charName: charName || '',
    userName: userName || '',
  };
}

async function callSummarizer(messages, systemPrompt, callChatCompletion) {
  const options = {
    temperature: 0.3,
    max_tokens: 2500,
    systemPrompt,
  };

  if (typeof callChatCompletion === 'function') {
    try {
      return await callChatCompletion(messages, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AI completion failed: ${message}`);
    }
  }

  const ctx = getSillyTavernContext();
  if (!ctx) {
    throw new Error('SillyTavern context not available for summarization.');
  }

  // Build the user prompt from messages
  const userPrompt = messages.map(m => m.content).join('\n\n');

  // Try generateRaw first (quiet, no chat message created)
  if (typeof ctx.generateRaw === 'function') {
    try {
      logger.debug('Using generateRaw for quiet summarization');
      return await ctx.generateRaw({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('generateRaw failed, trying generateText:', message);
    }
  }

  // Try generateText as fallback (quiet, returns text only)
  if (typeof ctx.generateText === 'function') {
    try {
      logger.debug('Using generateText for quiet summarization');
      return await ctx.generateText({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('generateText failed, trying generate:', message);
    }
  }

  // Last resort: generate() - but this may create a visible message
  if (typeof ctx.generate === 'function') {
    try {
      logger.debug('Using generate for summarization (may create visible message)');
      return await ctx.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        quiet: true,
        stream: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SillyTavern generate() failed: ${message}`);
    }
  }

  throw new Error('No AI generation API is available for summarization. Ensure SillyTavern is properly initialized.');
}

/**
 * Summarizes message text using AI for use as image prompts.
 * @param {string} text - Message text to summarize
 * @param {string} charName - Character name
 * @param {string} userName - User name
 * @param {Object} settings - Extension settings
 * @returns {Promise<string>} Summarized prompt
 */
export async function summarizeWithAI(text, charName, userName, settings) {
  const config = buildInvocationConfig(text, charName, userName, settings);
  const characterDescription = getCharacterDescription(config.charName);
  const appearanceLines = characterDescription;
  const systemPrompt = buildSystemPrompt(config.systemPromptTemplate, appearanceLines);

  logger.debug('Summarizing with AI', {
    messageCount: config.messages.length,
    charName: config.charName,
    userName: config.userName,
  });

  try {
    const result = await callSummarizer(config.messages, systemPrompt, config.callChatCompletion);
    const content = normalizeResponseContent(result);

    if (!content) {
      throw new Error('AI returned an empty or invalid summarizer response');
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Summarization failed:', message);
    throw new Error(`Image summarization failed: ${message}`);
  }
}
