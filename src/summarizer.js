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

const DEFAULT_SYSTEM_PROMPT_TEMPLATE = `Create image generation prompts from roleplay scenarios.

Character Appearance:
{{APPEARANCE_LINES}}

Rules:
- Use only literal visual descriptions
- No metaphors, emotions, or abstract concepts
- Only include what can be seen: colors, shapes, positions, lighting, textures
- Be concise - omit unnecessary words

Output Format:
{{OUTPUT_FORMAT_LINES}}`;

const OUTPUT_FORMAT_LINES = [
  'Characters:',
  '- [Name]: [pose, expression, clothing, visible features]',
  '',
  'Scene: [environment, lighting, camera angle]',
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
      const labels = [c?.data?.name, c?.name, c?.data?.displayName];
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

async function callSummarizer(messages, systemPrompt, callChatCompletion, maxTokens = 0, characterPercent = 30, scenePercent = 70, promptInjection = {}) {
  logger.debug('callSummarizer invoked', {
    messageCount: messages.length,
    systemPromptLength: systemPrompt?.length,
    hasCallChatCompletion: typeof callChatCompletion === 'function',
    maxTokens,
    characterPercent,
    scenePercent,
    hasPromptInjection: Object.keys(promptInjection).length > 0
  });

  function buildTaskInstructions() {
    const taskInstructions = [];
    
    if (systemPrompt) {
      taskInstructions.push(systemPrompt);
    }

    if (promptInjection?.enabled) {
      if (promptInjection?.mainPrompt && !promptInjection.mainPrompt.includes('<pic')) {
        taskInstructions.push(promptInjection.mainPrompt);
      }

      if (promptInjection?.instructionsPositive && !promptInjection.instructionsPositive.includes('<pic')) {
        taskInstructions.push(`Additional instructions: ${promptInjection.instructionsPositive}`);
      }
      if (promptInjection?.instructionsNegative && !promptInjection.instructionsNegative.includes('<pic')) {
        taskInstructions.push(`Avoid: ${promptInjection.instructionsNegative}`);
      }

      if (promptInjection?.picCountMode && promptInjection.picCountMode !== 'none') {
        let picCountInstruction = '';
        if (promptInjection.picCountMode === 'exact' && promptInjection.picCountExact > 0) {
          picCountInstruction = `Generate exactly ${promptInjection.picCountExact} image prompt(s).`;
        } else if (promptInjection.picCountMode === 'range') {
          const min = promptInjection.picCountMin ?? 1;
          const max = promptInjection.picCountMax ?? 3;
          picCountInstruction = `Generate between ${min} and ${max} image prompts.`;
        }
        if (picCountInstruction) {
          taskInstructions.push(picCountInstruction);
        }
      }
    }
    
    if (characterPercent > 0 || scenePercent > 0) {
      taskInstructions.push(`Allocate approximately ${characterPercent}% of your response to character description and ${scenePercent}% to scene description.`);
    }
    
    if (maxTokens > 0) {
      taskInstructions.push(`Keep your response under ${Math.floor(maxTokens * 0.75)} words.`);
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
      const userPrompt = `${taskSection}\n\n---\n\nConversation to analyze:\n${conversationText}`;
      const modifiedMessages = [
        { role: 'system', content: `${systemPrompt ? systemPrompt + '\n\n' : ''}${taskSection}` },
        { role: 'user', content: userPrompt },
        ...messages
      ];
      const options = {
        temperature: 0.3,
        max_tokens: maxTokens > 0 ? maxTokens : 2500,
        systemPrompt,
      };
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
    genOptions.max_tokens = maxTokens;
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
    maxTokens: config.maxTokens,
    characterPercent: config.characterPercent,
    scenePercent: config.scenePercent,
  });

  try {
    const result = await callSummarizer(
      config.messages, 
      systemPrompt, 
      config.callChatCompletion, 
      config.maxTokens,
      config.characterPercent,
      config.scenePercent,
      config.promptInjection
    );
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
