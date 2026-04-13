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

const TOKENS_HEADROOM_MULTIPLIER = 1.5;

const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `Create image generation prompts from roleplay scenarios.

Character Appearance:
{{APPEARANCE_LINES}}

Rules:
- Use only literal visual descriptions
- No metaphors, emotions, or abstract concepts
- Only include what can be seen: colors, shapes, positions, lighting, textures
- Be concise - omit unnecessary words
- Group all shared character traits (body type, common clothing style) into the Shared line under Characters - NEVER repeat them per character
- Each character line must be SHORT: only what makes them visually unique (skin, hair, accessories, distinctive clothing, pose)
- Omit minor details (finger positions, small accessories, texture descriptions, fabric sheen) - they waste the word budget
- Scene description must be brief: name the location, 2-3 key visual elements, and lighting - nothing more

Output Format:
{{OUTPUT_FORMAT_LINES}}`;

const OUTPUT_FORMAT_LINES = [
  'Characters:',
  '  Shared: [body type; common clothing style if shared across all characters]',
  '  - [Name]: [unique traits only - skin, hair, accessories, distinctive clothing, pose]',
  '',
  'Scene: [location, 2-3 key visual elements, lighting]',
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
      const labels = [c?.data?.name, c?.name, c?.data?.displayName, c?.displayName];
      return labels.some((label) => label && String(label).trim().toLowerCase() === needle);
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

function stripReasoning(text) {
  if (typeof text !== 'string') return text;
  // Remove <thinking>...</thinking> tags (DeepSeek R1, some OpenAI-compatible models)
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  // Remove <reasoning>...</reasoning> tags (some models)
  text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  // Remove <reflection>...</reflection> tags (some models)
  text = text.replace(/<reflection>[\s\S]*?<\/reflection>/gi, '');
  // Remove leading/trailing whitespace left after stripping
  return text.trim();
}

/**
 * Normalizes the response from various AI completion APIs into a single string.
 * Explicitly ignores reasoning/thinking fields and strips reasoning tags from content.
 * @param {Object|string} result - Raw API response or string
 * @returns {string} Cleaned content string
 */
function normalizeResponseContent(result) {
  // Extract content from standard OpenAI-compatible response structure
  const message = result?.choices?.[0]?.message;
  if (message) {
    // Prefer the main content field; explicitly skip reasoning_content / thinking fields
    const content = message.content;
    if (typeof content === 'string' && content.trim()) {
      return stripReasoning(content.trim());
    }
  }

  // Fallback: check if the result itself is a string
  if (typeof result === 'string' && result.trim()) {
    return stripReasoning(result.trim());
  }

  // Try common alternative response shapes
  const candidates = [
    result?.text,
    result?.message?.content,
    result?.content,
    result?.reply,
    result?.output,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return stripReasoning(candidate.trim());
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
      maxTokens: inputOrText.maxTokens ?? inputOrText.settings?.maxTokens ?? inputOrText.settings?.summarizer?.maxTokens ?? 0,
      characterPercent: inputOrText.characterPercent ?? inputOrText.settings?.characterPercent ?? inputOrText.settings?.summarizer?.characterPercent ?? 30,
      scenePercent: inputOrText.scenePercent ?? inputOrText.settings?.scenePercent ?? inputOrText.settings?.summarizer?.scenePercent ?? 70,
      promptInjection: inputOrText.promptInjection || {},
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
    maxTokens: summarizerSettings.maxTokens ?? 0,
    characterPercent: summarizerSettings.characterPercent ?? 30,
    scenePercent: summarizerSettings.scenePercent ?? 70,
    promptInjection: {},
  };
}

async function callSummarizer({ messages, systemPrompt, callChatCompletion, maxTokens = 0, characterPercent = 30, scenePercent = 70, promptInjection = {} }) {
  logger.debug('callSummarizer invoked', {
    messageCount: messages.length,
    systemPromptLength: systemPrompt?.length,
    hasCallChatCompletion: typeof callChatCompletion === 'function',
    maxTokens,
    characterPercent,
    scenePercent,
    hasMainPrompt: Boolean(promptInjection?.mainPrompt && !promptInjection.mainPrompt.includes('<pic')),
    hasPositiveInstructions: Boolean(promptInjection?.instructionsPositive && !promptInjection.instructionsPositive.includes('<pic')),
    hasNegativeInstructions: Boolean(promptInjection?.instructionsNegative && !promptInjection.instructionsNegative.includes('<pic')),
  });

  function buildTaskInstructions() {
    const taskInstructions = [];
    
    if (systemPrompt) {
      taskInstructions.push(systemPrompt);
    }

    // Include main prompt, positive, and negative instructions when present and enabled
    if (promptInjection?.enabled) {
      if (promptInjection.mainPrompt && !promptInjection.mainPrompt.includes('<pic')) {
        taskInstructions.push(promptInjection.mainPrompt);
      }

      if (promptInjection.instructionsPositive && !promptInjection.instructionsPositive.includes('<pic')) {
        taskInstructions.push(`Additional instructions: ${promptInjection.instructionsPositive}`);
      }
      if (promptInjection.instructionsNegative && !promptInjection.instructionsNegative.includes('<pic')) {
        taskInstructions.push(`Avoid: ${promptInjection.instructionsNegative}`);
      }
    }

    if (promptInjection?.enabled && promptInjection.picCountMode && promptInjection.picCountMode !== 'none') {
      // Always clamp to single prompt - downstream code expects a single string
      taskInstructions.push('Generate exactly 1 image prompt.');
    }
    
    if (maxTokens > 0) {
      const totalWords = Math.floor(maxTokens * 0.75);
      if (characterPercent > 0 || scenePercent > 0) {
        const charWords = Math.floor(totalWords * characterPercent / 100);
        const sceneWords = Math.floor(totalWords * scenePercent / 100);
        const perCharWords = Math.floor(charWords / 3); // rough per-character estimate when count unknown
        taskInstructions.push(`STRICT WORD BUDGET - stay close to these targets:`, `Total: ~${totalWords} words`, `Character section: ~${charWords} words (${characterPercent}%) — divide evenly across all characters`, `Scene section: ~${sceneWords} words (${scenePercent}%) — location + 2-3 visual elements + lighting, STOP`, `Per character: ~${perCharWords} words max — only unique traits, no shared details`, ``, `If you exceed any budget, cut minor details first (fabric texture, finger positions, small accessories, reflections).`);
      } else {
        taskInstructions.push(`Target approximately ${totalWords} words total.`);
      }
    } else if (characterPercent > 0 || scenePercent > 0) {
      taskInstructions.push(`Allocate ${characterPercent}% of your response to character description and ${scenePercent}% to scene description. Divide the character portion evenly across each character. Keep scene brief: location, 2-3 elements, lighting.`);
    }

    return taskInstructions.join('\n\n');
  }

  if (typeof callChatCompletion === 'function') {
    try {
      logger.debug('Using provided callChatCompletion');
      const taskSection = buildTaskInstructions();
      const conversationText = messages.map(m => {
        const role = m.role === 'assistant' ? 'Assistant' : 'User';
        return `${role}: ${m.content}`;
      }).join('\n\n');
      const userPrompt = `Conversation to analyze:\n${conversationText}`;
      const modifiedMessages = [
        { role: 'system', content: taskSection },
        { role: 'user', content: userPrompt }
      ];
      const options = {
        temperature: 0.3,
      };
      if (maxTokens > 0) {
        options.max_tokens = Math.ceil(maxTokens * TOKENS_HEADROOM_MULTIPLIER);
      }
      return await callChatCompletion(modifiedMessages, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AI completion failed: ${message}`);
    }
  }

  const ctx = getSillyTavernContext();
  if (!ctx) {
    throw new Error('SillyTavern context not available for summarization.');
  }

  const conversationText = messages.map(m => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    return `${role}: ${m.content}`;
  }).join('\n\n');
  
  // Build task instructions to embed in user prompt
  const taskSection = buildTaskInstructions();
  const userPrompt = `${taskSection}\n\n---\n\nConversation to analyze:\n${conversationText}`;

  logger.debug('Built user prompt', { promptLength: userPrompt.length });

  const genOptions = {
    prompt: userPrompt,
    temperature: 0.3,
  };

  if (maxTokens > 0) {
    genOptions.max_tokens = Math.ceil(maxTokens * TOKENS_HEADROOM_MULTIPLIER);
  }
  // Note: NOT passing systemPrompt - let the connection profile handle that

  if (typeof ctx.generateRaw === 'function') {
    try {
      logger.debug('Using generateRaw (profile system prompt + our task in user prompt)');
      return await ctx.generateRaw(genOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('generateRaw failed, trying generateText:', message);
    }
  }

  if (typeof ctx.generateText === 'function') {
    try {
      logger.debug('Using generateText (profile system prompt + our task in user prompt)');
      return await ctx.generateText(genOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('generateText failed, trying generate:', message);
    }
  }

  if (typeof ctx.generate === 'function') {
    try {
      logger.debug('Using generate');
      return await ctx.generate({
        messages: [{ role: 'user', content: userPrompt }],
        quiet: true,
        stream: false,
        temperature: genOptions.temperature,
        ...(genOptions.max_tokens && { max_tokens: genOptions.max_tokens }),
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
 * @param {string|Object} text - Message text to summarize, or config object with {messages, messageDepth, callChatCompletion, etc.}
 * @param {string} [charName] - Character name (ignored if text is a config object)
 * @param {string} [userName] - User name (ignored if text is a config object)
 * @param {Object} [settings] - Extension settings (ignored if text is a config object)
 * @returns {Promise<string>} Summarized prompt
 * 
 * Config object properties when text is an object:
 * @param {Array<{role: string, content: string}>} config.messages - Messages to summarize
 * @param {number} [config.messageDepth=1] - Number of recent messages to include
 * @param {Function} [config.callChatCompletion] - Optional function to call AI completion
 * @param {string} [config.systemPromptTemplate] - Template for system prompt
 * @param {Object} [config.characterDescriptions] - Character descriptions by name
 * @param {string} [config.charName] - Character name
 * @param {string} [config.userName] - User name
 * @param {number} [config.maxTokens=0] - Maximum tokens for response (0 = no limit). The API receives max_tokens = Math.ceil(maxTokens * TOKENS_HEADROOM_MULTIPLIER).
 * @param {number} [config.characterPercent=30] - Percentage for character description
 * @param {number} [config.scenePercent=70] - Percentage for scene description
 * @param {Object} [config.promptInjection] - Prompt injection settings
 * @param {string} [config.promptInjection.mainPrompt] - Main prompt guidance
 * @param {string} [config.promptInjection.instructionsPositive] - Positive constraints
 * @param {string} [config.promptInjection.instructionsNegative] - Negative constraints
 * @param {string} [config.promptInjection.picCountMode='exact'] - Image count mode: 'exact'|'range'|'min'|'max'
 * @param {number} [config.promptInjection.picCountExact=1] - Exact count when mode is 'exact'
 * @param {number} [config.promptInjection.picCountMin=1] - Minimum count when mode is 'min' or 'range'
 * @param {number} [config.promptInjection.picCountMax=3] - Maximum count when mode is 'max' or 'range'
 */
export async function summarizeWithAI(text, charName, userName, settings) {
  const config = buildInvocationConfig(text, charName, userName, settings);
  const characterDescriptions = config.characterDescriptions || {};
  const passedDescription = characterDescriptions[config.charName];
  const characterDescription = (passedDescription && passedDescription.trim()) ? passedDescription.trim() : getCharacterDescription(config.charName);
  const appearanceLines = characterDescription;
  const systemPrompt = buildSystemPrompt(config.systemPromptTemplate, appearanceLines);

  logger.debug('Summarizing with AI', {
    messageCount: config.messages.length,
    charName: config.charName,
    userName: config.userName,
    maxTokens: config.maxTokens,
    characterPercent: config.characterPercent,
    scenePercent: config.scenePercent,
  });

  try {
    const result = await callSummarizer({
      messages: config.messages,
      systemPrompt,
      callChatCompletion: config.callChatCompletion,
      maxTokens: config.maxTokens,
      characterPercent: config.characterPercent,
      scenePercent: config.scenePercent,
      promptInjection: config.promptInjection
    });
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
