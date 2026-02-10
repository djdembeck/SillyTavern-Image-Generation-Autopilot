/**
 * Pollinations Provider
 * Keyless GET-based API for image generation
 * Supports flux, turbo, and other models
 */

import { ImageProvider } from './base-provider.js';

const MODULE_NAME = 'PollinationsProvider';

export class PollinationsProvider extends ImageProvider {
  static providerName = 'Pollinations';
  static providerType = 'pollinations';
  static defaultBaseUrl = 'https://image.pollinations.ai';
  static requiredConfigFields = [];

  static supportedModels = [
    { id: 'flux', name: 'Flux', description: 'High quality image generation', default: true },
    { id: 'turbo', name: 'Turbo', description: 'Fast image generation' }
  ];

  constructor(config = {}) {
    super({
      baseUrl: config.baseUrl || PollinationsProvider.defaultBaseUrl,
      width: config.width || 1024,
      height: config.height || 1024,
      nologo: config.nologo !== undefined ? config.nologo : true,
      enhance: config.enhance !== undefined ? config.enhance : false,
      safe: config.safe !== undefined ? config.safe : false,
      model: config.model || 'flux',
      seed: config.seed,
      private: config.private,
      ...config
    });
  }

  buildUrl(prompt, options = {}) {
    const baseUrl = this.config.baseUrl || PollinationsProvider.defaultBaseUrl;
    const encodedPrompt = encodeURIComponent(prompt);

    const params = new URLSearchParams();

    const width = options.width || this.config.width || 1024;
    const height = options.height || this.config.height || 1024;
    const seed = options.seed !== undefined ? options.seed : this.config.seed;
    const model = options.model || this.config.model || 'flux';
    const nologo = options.nologo !== undefined ? options.nologo : this.config.nologo;
    const enhance = options.enhance !== undefined ? options.enhance : this.config.enhance;
    const safe = options.safe !== undefined ? options.safe : this.config.safe;

    params.set('width', width.toString());
    params.set('height', height.toString());
    params.set('model', model);

    if (seed !== undefined) {
      params.set('seed', seed.toString());
    }

    if (nologo) {
      params.set('nologo', 'true');
    }

    if (enhance) {
      params.set('enhance', 'true');
    }

    if (safe) {
      params.set('safe', 'true');
    }

    const queryString = params.toString();
    return `${baseUrl}/prompt/${encodedPrompt}${queryString ? '?' + queryString : ''}`;
  }

  generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      const promise = Promise.reject(new Error('Prompt is required and must be a non-empty string'));
      promise.catch(() => {});
      return promise;
    }

    const model = options.model || this.config.model || 'flux';
    const validModels = PollinationsProvider.supportedModels.map(m => m.id);
    if (!validModels.includes(model)) {
      const promise = Promise.reject(new Error(`Invalid model: ${model}. Must be one of: ${validModels.join(', ')}`));
      promise.catch(() => {});
      return promise;
    }

    const url = this.buildUrl(prompt, options);

    return Promise.resolve({
      imageUrl: url,
      metadata: {
        prompt,
        seed: options.seed !== undefined ? options.seed : this.config.seed,
        model: model,
        width: options.width || this.config.width || 1024,
        height: options.height || this.config.height || 1024,
        timestamp: Date.now(),
        provider: 'pollinations'
      }
    });
  }

  async getModels() {
    return PollinationsProvider.supportedModels.map(model => ({
      ...model,
      provider: 'Pollinations'
    }));
  }

  validateConfig(config) {
    const errors = [];

    if (config.width !== undefined) {
      if (typeof config.width !== 'number' || config.width <= 0) {
        errors.push('width must be a positive number');
      }
    }

    if (config.height !== undefined) {
      if (typeof config.height !== 'number' || config.height <= 0) {
        errors.push('height must be a positive number');
      }
    }

    if (config.seed !== undefined) {
      if (typeof config.seed !== 'number') {
        errors.push('seed must be a number');
      }
    }

    if (config.model !== undefined) {
      if (typeof config.model !== 'string' || config.model.trim() === '') {
        errors.push('model must be a non-empty string');
      }
    }

    if (config.safe !== undefined) {
      if (typeof config.safe !== 'boolean') {
        errors.push('safe must be a boolean');
      }
    }

    if (config.nologo !== undefined) {
      if (typeof config.nologo !== 'boolean') {
        errors.push('nologo must be a boolean');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static isAvailable() {
    return typeof fetch !== 'undefined';
  }
}

export default PollinationsProvider;
