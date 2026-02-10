/**
 * Base ImageProvider Interface
 * Abstract base class for all image generation providers
 */

const MODULE_NAME = 'ImageProvider';

/**
 * Base class for image generation providers
 * All provider implementations must extend this class
 */
export class ImageProvider {
  /**
   * Provider name identifier
   * @type {string}
   */
  static providerName = 'base';

  /**
   * Provider type classification
   * @type {string}
   */
  static providerType = 'base';

  /**
   * Required configuration fields
   * @type {string[]}
   */
  static requiredConfigFields = ['apiKey', 'baseUrl'];

  /**
   * Creates an instance of ImageProvider
   * @param {Object} config - Provider configuration
   */
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Generate an image from a prompt
   * @param {string} prompt - The image generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<{imageUrl: string, metadata: Object}>}
   * @throws {Error} Must be implemented by subclass
   */
  generate(prompt, options = {}) {
    const promise = Promise.reject(
      new Error(`generate() method not implemented in ${this.constructor.name}`)
    );
    promise.catch(() => {});
    return promise;
  }

  /**
   * Validate provider configuration
   * @param {Object} config - Configuration to validate
   * @returns {{isValid: boolean, errors: string[]}} Validation result
   */
  validateConfig(config) {
    const errors = [];

    // Validate required fields
    for (const field of this.constructor.requiredConfigFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate apiKey if present
    if (config.apiKey !== undefined) {
      if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        errors.push('apiKey must be a non-empty string');
      }
    }

    // Validate baseUrl if present
    if (config.baseUrl !== undefined) {
      if (typeof config.baseUrl !== 'string' || config.baseUrl.trim() === '') {
        errors.push('baseUrl must be a non-empty string');
      } else {
        try {
          new URL(config.baseUrl);
        } catch {
          errors.push('baseUrl must be a valid URL');
        }
      }
    }

    // Validate timeout if present
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout <= 0) {
        errors.push('timeout must be a positive number');
      }
    }

    // Validate model if present
    if (config.model !== undefined) {
      if (typeof config.model !== 'string' || config.model.trim() === '') {
        errors.push('model must be a non-empty string');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available models from the provider
   * @returns {Promise<Array<{id: string, name: string}>>}
   * @throws {Error} Must be implemented by subclass
   */
  getModels() {
    const promise = Promise.reject(
      new Error(`getModels() method not implemented in ${this.constructor.name}`)
    );
    promise.catch(() => {});
    return promise;
  }
}

export default ImageProvider;
