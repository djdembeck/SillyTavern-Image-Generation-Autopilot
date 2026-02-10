/**
 * NanoGPT Provider
 * OpenAI-compatible API for image generation
 * Supports Z Image Turbo and Qwen Image models
 */

import { ImageProvider } from './base-provider.js';

const MODULE_NAME = 'NanoGPTProvider';

/**
 * NanoGPT image generation provider
 * Uses OpenAI-compatible API format
 */
export class NanoGPTProvider extends ImageProvider {
  static providerName = 'NanoGPT';
  static providerType = 'openai-compatible';
  static defaultBaseUrl = 'https://nano-gpt.com/api/v1';
  static defaultModel = 'z-image-turbo';

  static supportedModels = [
    { id: 'z-image-turbo', name: 'Z Image Turbo', description: 'Excellent for realistic styles and detailed scenes' },
    { id: 'qwen-image', name: 'Qwen Image', description: 'Perfect for animated, anime, and stylized art' }
  ];

  constructor(config = {}, { fetch = globalThis.fetch, AbortController = globalThis.AbortController } = {}) {
    super({
      baseUrl: config.baseUrl || NanoGPTProvider.defaultBaseUrl,
      model: config.model || NanoGPTProvider.defaultModel,
      ...config
    });
    this.fetch = fetch;
    this.AbortController = AbortController;
  }

  get imagesGenerateEndpoint() {
    return '/images/generations';
  }

  buildApiUrl(endpoint) {
    const baseUrl = this.config.baseUrl || NanoGPTProvider.defaultBaseUrl;
    return `${baseUrl}${endpoint}`;
  }

  buildRequestHeaders() {
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (this.config.organizationId) {
      headers['Organization'] = this.config.organizationId;
    }

    return headers;
  }

  buildRequestBody(prompt, options = {}) {
    const body = {
      prompt,
      model: options.model || this.config.model || NanoGPTProvider.defaultModel,
      n: options.n || 1,
      response_format: 'url'
    };

    if (options.aspectRatio) {
      const dimensions = this.parseAspectRatio(options.aspectRatio);
      if (dimensions) {
        body.size = `${dimensions.width}x${dimensions.height}`;
      }
    } else if (options.width && options.height) {
      body.size = `${options.width}x${options.height}`;
    }

    if (options.seed !== undefined) {
      body.seed = options.seed;
    }

    return body;
  }

  parseAspectRatio(ratio) {
    switch (ratio) {
      case '1:1':
        return { width: 1024, height: 1024 };
      case '16:9':
        return { width: 1024, height: 576 };
      case '9:16':
        return { width: 576, height: 1024 };
      case '4:3':
        return { width: 1024, height: 768 };
      case '3:4':
        return { width: 768, height: 1024 };
      default:
        return null;
    }
  }

  parseResponse(response) {
    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      throw new Error('Invalid response: no image data received');
    }

    const imageData = response.data[0];

    if (!imageData.url && !imageData.b64_json) {
      throw new Error('Invalid response: missing image URL or base64 data');
    }

    const imageUrl = imageData.url
      ? imageData.url
      : `data:image/png;base64,${imageData.b64_json}`;

    return {
      imageUrl,
      metadata: {
        revisedPrompt: imageData.revised_prompt,
        created: response.created
      }
    };
  }

  parseError(errorResponse, statusCode) {
    let error = new Error('Unknown error');
    error.code = 'UNKNOWN_ERROR';
    error.statusCode = statusCode;

    if (!errorResponse) {
      error.message = 'Unknown error occurred';
      return error;
    }

    if (errorResponse.error) {
      const err = errorResponse.error;
      error.message = err.message || 'Unknown error';
      error.type = err.type;
      error.code = err.code || 'UNKNOWN_ERROR';

      if (err.type === 'rate_limit_error' || err.code === 'rate_limit_exceeded') {
        error.isRateLimit = true;
        error.code = err.code || 'rate_limit_exceeded';
        if (errorResponse.headers && errorResponse.headers['retry-after']) {
          error.retryAfter = parseInt(errorResponse.headers['retry-after'], 10);
        }
      }

      if (err.type === 'billing_error' || err.code === 'insufficient_credits') {
        error.isBillingError = true;
        error.code = err.code || 'insufficient_credits';
      }

      if (err.type === 'invalid_request_error' || err.code === 'model_not_found') {
        error.isInvalidModel = true;
        error.code = err.code || 'model_not_found';
      }

      if (err.type === 'authentication_error' || err.code === 'invalid_api_key') {
        error.code = err.code || 'invalid_api_key';
      }
    }

    const status = statusCode || errorResponse.status;
    if (status && !errorResponse.error) {
      error.message = `HTTP ${status}: ${errorResponse.statusText || 'Request failed'}`;
    }

    error.raw = errorResponse;
    return error;
  }

  async generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      throw new Error('Prompt is required and must be a non-empty string');
    }

    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }

    const url = this.buildApiUrl(this.imagesGenerateEndpoint);
    const headers = this.buildRequestHeaders();
    const body = this.buildRequestBody(prompt, options);

    const controller = new AbortController();
    const timeout = options.timeout || this.config.timeout || 120000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        const error = this.parseError(responseData, response.status);
        error.response = responseData;
        error.status = response.status;
        throw error;
      }

      return this.parseResponse(responseData);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }

      if (error.status || error.code) {
        throw error;
      }

      const networkError = new Error(error.message || 'Network error');
      networkError.code = 'NETWORK_ERROR';
      networkError.originalError = error;
      throw networkError;
    }
  }

  async getModels() {
    return NanoGPTProvider.supportedModels.map(model => ({
      ...model,
      provider: 'NanoGPT'
    }));
  }

  validateConfig(config) {
    const errors = [];

    if (!config.apiKey) {
      errors.push('Missing required field: apiKey');
    } else {
      const key = config.apiKey;
      if (!key.startsWith('nano_') && !key.startsWith('sk-')) {
        errors.push('apiKey format is invalid');
      }
    }

    if (!config.model) {
      errors.push('Missing required field: model');
    } else {
      const validModels = NanoGPTProvider.supportedModels.map(m => m.id);
      if (!validModels.includes(config.model)) {
        errors.push(`Invalid model: ${config.model}`);
      }
    }

    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout <= 0) {
        errors.push('timeout must be a positive number');
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

  static getDocumentationUrl() {
    return 'https://nano-gpt.com/api';
  }

  static getPricingUrl() {
    return 'https://nano-gpt.com/pricing';
  }
}
