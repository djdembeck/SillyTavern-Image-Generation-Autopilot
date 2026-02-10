/**
 * Provider Registry
 * Manages multiple image generation providers with fallback chain support
 */

import { ImageProvider } from './base-provider.js';

const MODULE_NAME = 'ProviderRegistry';

/**
 * Registry for managing multiple image generation providers
 * Supports priority-based selection and automatic fallback on failure
 */
export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.priorityList = [];
  }

  /**
   * Register a provider with the registry
   * @param {string} name - Provider identifier
   * @param {ImageProvider} provider - Provider instance
   * @param {Object} options - Registration options
   * @param {number} options.priority - Priority level (lower = higher priority)
   * @param {boolean} options.enabled - Whether provider is enabled
   */
  register(name, provider, options = {}) {
    if (!provider) {
      throw new Error('Provider instance is required');
    }

    if (!(provider instanceof ImageProvider)) {
      throw new Error('Provider must extend ImageProvider base class');
    }

    this.providers.set(name, {
      instance: provider,
      priority: options.priority !== undefined ? options.priority : 100,
      enabled: options.enabled !== undefined ? options.enabled : true,
      name
    });

    this._updatePriorityList();
  }

  /**
   * Unregister a provider
   * @param {string} name - Provider identifier
   */
  unregister(name) {
    this.providers.delete(name);
    this._updatePriorityList();
  }

  /**
   * Get a registered provider by name
   * @param {string} name - Provider identifier
   * @returns {ImageProvider|null}
   */
  get(name) {
    const entry = this.providers.get(name);
    return entry ? entry.instance : null;
  }

  /**
   * Get provider configuration by name
   * @param {string} name - Provider identifier
   * @returns {Object|null}
   */
  getProviderConfig(name) {
    return this.providers.get(name) || null;
  }

  /**
   * Get all registered providers
   * @returns {Array<{name: string, instance: ImageProvider, priority: number, enabled: boolean}>}
   */
  getAll() {
    return Array.from(this.providers.values());
  }

  /**
   * Get enabled providers sorted by priority
   * @returns {Array<{name: string, instance: ImageProvider, priority: number}>}
   */
  getEnabledProviders() {
    return this.priorityList.filter(p => p.enabled);
  }

  /**
   * Set provider priority
   * @param {string} name - Provider identifier
   * @param {number} priority - New priority level
   */
  setPriority(name, priority) {
    const entry = this.providers.get(name);
    if (entry) {
      entry.priority = priority;
      this._updatePriorityList();
    }
  }

  /**
   * Enable a provider
   * @param {string} name - Provider identifier
   */
  enable(name) {
    const entry = this.providers.get(name);
    if (entry) {
      entry.enabled = true;
      this._updatePriorityList();
    }
  }

  /**
   * Disable a provider
   * @param {string} name - Provider identifier
   */
  disable(name) {
    const entry = this.providers.get(name);
    if (entry) {
      entry.enabled = false;
      this._updatePriorityList();
    }
  }

  /**
   * Check if a provider is registered
   * @param {string} name - Provider identifier
   * @returns {boolean}
   */
  has(name) {
    return this.providers.has(name);
  }

  /**
   * Generate an image with automatic fallback
   * Tries providers in priority order until one succeeds
   * @param {string} prompt - Image generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<{imageUrl: string, metadata: Object, provider: string}>}
   */
  async generateWithFallback(prompt, options = {}) {
    const enabledProviders = this.getEnabledProviders();

    if (enabledProviders.length === 0) {
      throw new Error('No enabled providers available');
    }

    const errors = [];

    for (const providerEntry of enabledProviders) {
      try {
        const result = await providerEntry.instance.generate(prompt, options);
        return {
          ...result,
          provider: providerEntry.name
        };
      } catch (error) {
        errors.push({
          provider: providerEntry.name,
          error: error.message,
          code: error.code
        });

        if (this._isFatalError(error)) {
          break;
        }
      }
    }

    const fallbackError = new Error(
      `All providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`
    );
    fallbackError.code = 'ALL_PROVIDERS_FAILED';
    fallbackError.errors = errors;
    throw fallbackError;
  }

  /**
   * Validate all registered provider configurations
   * @returns {Array<{name: string, isValid: boolean, errors: string[]}>}
   */
  validateAll() {
    const results = [];

    for (const [name, entry] of this.providers) {
      const validation = entry.instance.validateConfig(entry.instance.config);
      results.push({
        name,
        ...validation
      });
    }

    return results;
  }

  /**
   * Clear all registered providers
   */
  clear() {
    this.providers.clear();
    this.priorityList = [];
  }

  /**
   * Get count of registered providers
   * @returns {number}
   */
  get count() {
    return this.providers.size;
  }

  /**
   * Update the priority list (sorted by priority)
   * @private
   */
  _updatePriorityList() {
    this.priorityList = Array.from(this.providers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if an error is fatal (should stop fallback chain)
   * @private
   * @param {Error} error
   * @returns {boolean}
   */
  _isFatalError(error) {
    const fatalCodes = ['CONTENT_POLICY', 'AUTH_ERROR'];
    return fatalCodes.includes(error.code);
  }

  /**
   * Create a registry from a configuration object
   * @param {Object} config - Configuration with provider settings
   * @returns {ProviderRegistry}
   */
  static fromConfig(config) {
    const registry = new ProviderRegistry();

    if (config.providers) {
      for (const [name, providerConfig] of Object.entries(config.providers)) {
        if (providerConfig.class && typeof providerConfig.class === 'function') {
          const instance = new providerConfig.class(providerConfig.options || {});
          registry.register(name, instance, {
            priority: providerConfig.priority,
            enabled: providerConfig.enabled
          });
        }
      }
    }

    return registry;
  }
}

export default ProviderRegistry;
