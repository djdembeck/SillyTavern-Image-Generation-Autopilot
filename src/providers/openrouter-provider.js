/**
 * OpenRouter Provider
 * OpenAI-compatible API with special headers
 * Supports multiple image models through unified interface
 */

import { ImageProvider } from './base-provider.js';

const MODULE_NAME = 'OpenRouterProvider';

export class OpenRouterProvider extends ImageProvider {
  static providerName = 'openrouter';
  static providerType = 'openai-compatible';
  static requiredConfigFields = ['apiKey', 'baseUrl', 'httpReferer', 'xTitle'];

  constructor(config = {}) {
    super(config);
  }

  getEndpoint() {
    const baseUrl = this.config.baseUrl;
    return `${baseUrl}/images/generations`;
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': this.config.httpReferer,
      'X-Title': this.config.xTitle
    };
  }

  buildRequestBody(prompt, options = {}) {
    const body = {
      prompt,
      model: options.model || this.config.model,
      n: options.n || 1,
      response_format: 'url'
    };

    if (options.aspectRatio) {
      const dimensions = this.parseAspectRatio(options.aspectRatio);
      if (dimensions) {
        body.size = `${dimensions.width}x${dimensions.height}`;
      }
    } else if (options.size) {
      body.size = options.size;
    } else if (options.width && options.height) {
      body.size = `${options.width}x${options.height}`;
    }

    if (options.quality) {
      body.quality = options.quality;
    }

    if (options.style) {
      body.style = options.style;
    }

    if (options.user) {
      body.user = options.user;
    }

    if (options.transforms) {
      body.transforms = options.transforms;
    }

    if (this.config.providerRouting) {
      body.provider = this.config.providerRouting;
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

  parseResponse(response, originalPrompt) {
    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      throw new Error('Invalid response: no image data received');
    }

    const result = {
      imageUrl: null,
      metadata: {
        created: response.created
      }
    };

    const imageData = response.data[0];

    if (imageData.url) {
      result.imageUrl = imageData.url;
    } else if (imageData.b64_json) {
      result.imageUrl = `data:image/png;base64,${imageData.b64_json}`;
    }

    if (imageData.revised_prompt) {
      result.metadata.revisedPrompt = imageData.revised_prompt;
    }

    if (originalPrompt) {
      result.metadata.prompt = originalPrompt;
    }

    if (response.data.length > 1) {
      result.images = response.data.map(img => ({
        url: img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null),
        revisedPrompt: img.revised_prompt
      }));
    }

    return result;
  }

  parseError(errorResponse, statusCode = 0) {
    let error = new Error('Unknown error');
    error.code = 'UNKNOWN_ERROR';
    error.statusCode = statusCode;

    if (!errorResponse) {
      error.message = 'Unknown error occurred';
      return error;
    }

    if (errorResponse instanceof Error) {
      error.message = errorResponse.message;
      if (errorResponse.message.toLowerCase().includes('network')) {
        error.code = 'NETWORK_ERROR';
      } else if (errorResponse.message.toLowerCase().includes('timeout')) {
        error.code = 'TIMEOUT';
      }
      return error;
    }

    if (errorResponse.error) {
      const err = errorResponse.error;
      error.message = err.message || 'Unknown error';
      error.raw = errorResponse;

      const errorType = err.type?.toLowerCase() || '';
      const errorCode = err.code?.toLowerCase() || '';

      if (statusCode === 429 || errorType.includes('rate_limit') || errorCode.includes('rate_limit')) {
        error.code = 'RATE_LIMIT';
        error.message = `Rate limit exceeded: ${err.message}`;
      } else if (statusCode === 401 || errorType.includes('authentication')) {
        error.code = 'AUTH_ERROR';
        error.message = `authentication error: ${err.message}`;
      } else if (statusCode === 404 || errorType.includes('invalid_request') || err.param === 'model') {
        error.code = 'MODEL_NOT_FOUND';
        error.message = `model error: ${err.message}`;
      } else if (statusCode === 402 || errorType.includes('payment') || errorCode.includes('insufficient_credits')) {
        error.code = 'INSUFFICIENT_CREDITS';
        error.message = `Insufficient credits: ${err.message}`;
      } else if (errorType.includes('content_policy')) {
        error.code = 'CONTENT_POLICY';
        error.message = `Content policy violation: ${err.message}`;
      } else {
        error.code = err.code?.toUpperCase() || 'UNKNOWN_ERROR';
      }
    } else {
      error.message = `HTTP ${statusCode}: ${errorResponse.statusText || 'Request failed'}`;
      error.raw = errorResponse;
    }

    return error;
  }

  async generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      throw new Error('Prompt is required and must be a non-empty string');
    }

    const validation = this.validateConfig(this.config);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const url = this.getEndpoint();
    const headers = this.getHeaders();
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

      return this.parseResponse(responseData, prompt);
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
    if (this._modelsCache) {
      return this._modelsCache;
    }

    const baseUrl = this.config.baseUrl;
    const url = `${baseUrl}/models`;
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': this.config.httpReferer,
      'X-Title': this.config.xTitle
    };

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        return [];
      }

      const imageModels = data.data.filter(model => {
        const id = model.id?.toLowerCase() || '';
        const description = model.description?.toLowerCase() || '';
        const name = model.name?.toLowerCase() || '';

        const imageKeywords = [
          'image', 'dall-e', 'sdxl', 'stable-diffusion', 'flux', 'imagen',
          'midjourney', 'art', 'picture', 'photo', 'visual', 'generate'
        ];

        return imageKeywords.some(keyword =>
          id.includes(keyword) ||
          description.includes(keyword) ||
          name.includes(keyword)
        );
      });

      const models = imageModels.map(model => ({
        id: model.id,
        name: model.name || model.id,
        description: model.description || `Image generation model via OpenRouter`,
        provider: 'OpenRouter'
      }));

      this._modelsCache = models;

      return models;
    } catch (error) {
      return [];
    }
  }

  validateConfig(config) {
    const errors = [];

    if (!config.apiKey) {
      errors.push('Missing required field: apiKey');
    }

    if (!config.baseUrl) {
      errors.push('Missing required field: baseUrl');
    }

    if (!config.httpReferer) {
      errors.push('Missing required field: httpReferer');
    } else {
      try {
        new URL(config.httpReferer);
      } catch {
        errors.push('httpReferer must be a valid URL');
      }
    }

    if (!config.xTitle) {
      errors.push('Missing required field: xTitle');
    } else if (typeof config.xTitle !== 'string' || config.xTitle.trim() === '') {
      errors.push('xTitle must be a non-empty string');
    } else if (config.xTitle.length > 50) {
      errors.push('xTitle must be 50 characters or less');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default OpenRouterProvider;
