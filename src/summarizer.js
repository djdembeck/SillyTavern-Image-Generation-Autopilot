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

// Placeholder for system prompt template
// const SYSTEM_PROMPT_TEMPLATE = '';

/**
 * Summarizes message text using AI for use as image prompts.
 * @param {string} text - Message text to summarize
 * @param {string} charName - Character name
 * @param {string} userName - User name
 * @param {Object} settings - Extension settings
 * @returns {Promise<string>} Summarized prompt
 */
export function summarizeWithAI(text, charName, userName, settings) {
  throw new Error('Not implemented');
}