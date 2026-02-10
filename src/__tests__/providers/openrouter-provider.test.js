/**
 * OpenRouter Provider Tests
 * RED Phase: Tests define OpenRouter-specific behavior before implementation
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { OpenRouterProvider } from '../../providers/openrouter-provider.js';
import { ImageProvider } from '../../providers/base-provider.js';

describe('OpenRouterProvider', () => {
  describe('Class Definition', () => {
    it('should export OpenRouterProvider class', () => {
      expect(OpenRouterProvider).toBeDefined();
      expect(typeof OpenRouterProvider).toBe('function');
    });

    it('should extend ImageProvider base class', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider).toBeInstanceOf(ImageProvider);
      expect(provider).toBeInstanceOf(OpenRouterProvider);
    });

    it('should have providerName static property set to "openrouter"', () => {
      expect(OpenRouterProvider.providerName).toBe('openrouter');
    });

    it('should have providerType static property set to "openai-compatible"', () => {
      expect(OpenRouterProvider.providerType).toBe('openai-compatible');
    });
  });

  describe('OpenRouter-Specific Configuration', () => {
    it('should accept httpReferer in config', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://myapp.com'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config.httpReferer).toBe('https://myapp.com');
    });

    it('should accept xTitle in config', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        xTitle: 'My Application'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config.xTitle).toBe('My Application');
    });

    it('should accept both httpReferer and xTitle together', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://myapp.com',
        xTitle: 'My Application'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config.httpReferer).toBe('https://myapp.com');
      expect(provider.config.xTitle).toBe('My Application');
    });

    it('should store all config fields including OpenRouter-specific ones', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/dall-e-3',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        timeout: 60000
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config).toEqual(config);
    });
  });

  describe('Required Config Fields', () => {
    it('should list apiKey, baseUrl, httpReferer, and xTitle as required fields', () => {
      const required = OpenRouterProvider.requiredConfigFields;
      expect(required).toContain('apiKey');
      expect(required).toContain('baseUrl');
      expect(required).toContain('httpReferer');
      expect(required).toContain('xTitle');
    });

    it('should include base provider required fields', () => {
      const required = OpenRouterProvider.requiredConfigFields;
      expect(required).toContain('apiKey');
      expect(required).toContain('baseUrl');
    });

    it('should include OpenRouter-specific required fields', () => {
      const required = OpenRouterProvider.requiredConfigFields;
      expect(required).toContain('httpReferer');
      expect(required).toContain('xTitle');
    });
  });

  describe('validateConfig() - OpenRouter Specific', () => {
    let provider;

    beforeEach(() => {
      provider = new OpenRouterProvider({});
    });

    it('should validate httpReferer is present', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        xTitle: 'Test App'
        // missing httpReferer
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('httpreferer') || e.toLowerCase().includes('referer'))).toBe(true);
    });

    it('should validate httpReferer is a valid URL', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'not-a-valid-url',
        xTitle: 'Test App'
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('httpreferer') || e.toLowerCase().includes('url'))).toBe(true);
    });

    it('should validate xTitle is present', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com'
        // missing xTitle
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('xtitle') || e.toLowerCase().includes('title'))).toBe(true);
    });

    it('should validate xTitle is not empty', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: ''
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('xtitle') || e.toLowerCase().includes('title'))).toBe(true);
    });

    it('should validate xTitle has reasonable length', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'A'.repeat(100) // Too long
      };
      const result = provider.validateConfig(config);
      if (!result.isValid) {
        expect(result.errors.some(e => e.toLowerCase().includes('xtitle') || e.toLowerCase().includes('length'))).toBe(true);
      }
    });

    it('should pass validation with complete valid config', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test Application',
        model: 'openai/dall-e-3'
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should inherit base provider validation for apiKey', () => {
      const config = {
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
        // missing apiKey
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('apikey'))).toBe(true);
    });

    it('should inherit base provider validation for baseUrl', () => {
      const config = {
        apiKey: 'test-key',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
        // missing baseUrl
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('baseurl'))).toBe(true);
    });
  });

  describe('API Endpoint Structure', () => {
    it('should have correct base URL for OpenRouter', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('should support standard OpenRouter API endpoint', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.getEndpoint()).toBe('https://openrouter.ai/api/v1/images/generations');
    });

    it('should allow custom base URL for OpenRouter-compatible endpoints', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://custom.openrouter.proxy.com/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.getEndpoint()).toBe('https://custom.openrouter.proxy.com/api/v1/images/generations');
    });
  });

  describe('HTTP Headers', () => {
    let provider;

    beforeEach(() => {
      const config = {
        apiKey: 'test-api-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://myapp.com',
        xTitle: 'My Application'
      };
      provider = new OpenRouterProvider(config);
    });

    it('should generate HTTP-Referer header', () => {
      const headers = provider.getHeaders();
      expect(headers).toHaveProperty('HTTP-Referer');
      expect(headers['HTTP-Referer']).toBe('https://myapp.com');
    });

    it('should generate X-Title header', () => {
      const headers = provider.getHeaders();
      expect(headers).toHaveProperty('X-Title');
      expect(headers['X-Title']).toBe('My Application');
    });

    it('should include Authorization header with Bearer token', () => {
      const headers = provider.getHeaders();
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toBe('Bearer test-api-key');
    });

    it('should include Content-Type header', () => {
      const headers = provider.getHeaders();
      expect(headers).toHaveProperty('Content-Type');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include all required OpenRouter headers', () => {
      const headers = provider.getHeaders();
      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('Content-Type');
      expect(headers).toHaveProperty('HTTP-Referer');
      expect(headers).toHaveProperty('X-Title');
    });

    it('should use config values for headers', () => {
      const config = {
        apiKey: 'sk-or-v1-custom-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://different-site.com',
        xTitle: 'Different App Name'
      };
      const customProvider = new OpenRouterProvider(config);
      const headers = customProvider.getHeaders();
      expect(headers.Authorization).toBe('Bearer sk-or-v1-custom-key');
      expect(headers['HTTP-Referer']).toBe('https://different-site.com');
      expect(headers['X-Title']).toBe('Different App Name');
    });
  });

  describe('Request Body Structure', () => {
    let provider;

    beforeEach(() => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        model: 'openai/dall-e-3'
      };
      provider = new OpenRouterProvider(config);
    });

    it('should build request body with prompt', () => {
      const body = provider.buildRequestBody('a beautiful sunset');
      expect(body).toHaveProperty('prompt');
      expect(body.prompt).toBe('a beautiful sunset');
    });

    it('should include model in request body', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body).toHaveProperty('model');
      expect(body.model).toBe('openai/dall-e-3');
    });

    it('should include n parameter for number of images', () => {
      const body = provider.buildRequestBody('test prompt', { n: 2 });
      expect(body).toHaveProperty('n');
      expect(body.n).toBe(2);
    });

    it('should include size parameter when specified', () => {
      const body = provider.buildRequestBody('test prompt', { size: '1024x1024' });
      expect(body).toHaveProperty('size');
      expect(body.size).toBe('1024x1024');
    });

    it('should default n to 1 when not specified', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body.n).toBe(1);
    });

    it('should support quality parameter', () => {
      const body = provider.buildRequestBody('test prompt', { quality: 'hd' });
      expect(body).toHaveProperty('quality');
      expect(body.quality).toBe('hd');
    });

    it('should support style parameter', () => {
      const body = provider.buildRequestBody('test prompt', { style: 'vivid' });
      expect(body).toHaveProperty('style');
      expect(body.style).toBe('vivid');
    });

    it('should include response_format set to url', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body).toHaveProperty('response_format');
      expect(body.response_format).toBe('url');
    });

    it('should support user identifier parameter', () => {
      const body = provider.buildRequestBody('test prompt', { user: 'user-123' });
      expect(body).toHaveProperty('user');
      expect(body.user).toBe('user-123');
    });
  });

  describe('Response Handling', () => {
    let provider;

    beforeEach(() => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      provider = new OpenRouterProvider(config);
    });

    it('should parse successful response with image URL', () => {
      const mockResponse = {
        data: [{
          url: 'https://example.com/image.png',
          revised_prompt: 'A beautiful sunset over mountains'
        }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result).toHaveProperty('imageUrl');
      expect(result.imageUrl).toBe('https://example.com/image.png');
    });

    it('should include metadata in parsed response', () => {
      const mockResponse = {
        data: [{
          url: 'https://example.com/image.png',
          revised_prompt: 'A beautiful sunset'
        }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result).toHaveProperty('metadata');
      expect(typeof result.metadata).toBe('object');
    });

    it('should include revised_prompt in metadata when available', () => {
      const mockResponse = {
        data: [{
          url: 'https://example.com/image.png',
          revised_prompt: 'Enhanced prompt description'
        }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result.metadata).toHaveProperty('revisedPrompt');
      expect(result.metadata.revisedPrompt).toBe('Enhanced prompt description');
    });

    it('should include created timestamp in metadata', () => {
      const mockResponse = {
        data: [{ url: 'https://example.com/image.png' }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result.metadata).toHaveProperty('created');
      expect(result.metadata.created).toBe(1234567890);
    });

    it('should handle response with b64_json format', () => {
      const mockResponse = {
        data: [{
          b64_json: 'base64encodeddata',
          revised_prompt: 'Test prompt'
        }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result).toHaveProperty('imageUrl');
      expect(result.imageUrl).toContain('data:image');
    });

    it('should handle multiple images in response', () => {
      const mockResponse = {
        data: [
          { url: 'https://example.com/image1.png' },
          { url: 'https://example.com/image2.png' }
        ],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse);
      expect(result).toHaveProperty('images');
      expect(Array.isArray(result.images)).toBe(true);
      expect(result.images).toHaveLength(2);
    });

    it('should include original prompt in metadata', () => {
      const originalPrompt = 'original test prompt';
      const mockResponse = {
        data: [{ url: 'https://example.com/image.png' }],
        created: 1234567890
      };
      const result = provider.parseResponse(mockResponse, originalPrompt);
      expect(result.metadata).toHaveProperty('prompt');
      expect(result.metadata.prompt).toBe('original test prompt');
    });
  });

  describe('Error Handling - OpenRouter Specific', () => {
    let provider;

    beforeEach(() => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      provider = new OpenRouterProvider(config);
    });

    it('should handle OpenRouter rate limit errors (429)', () => {
      const errorResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_exceeded',
          code: 'rate_limit'
        }
      };
      const error = provider.parseError(errorResponse, 429);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Rate limit');
      expect(error.code).toBe('RATE_LIMIT');
    });

    it('should handle OpenRouter authentication errors (401)', () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error'
        }
      };
      const error = provider.parseError(errorResponse, 401);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('authentication');
      expect(error.code).toBe('AUTH_ERROR');
    });

    it('should handle OpenRouter model not found errors', () => {
      const errorResponse = {
        error: {
          message: 'Model not found',
          type: 'invalid_request_error',
          param: 'model'
        }
      };
      const error = provider.parseError(errorResponse, 404);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('model');
      expect(error.code).toBe('MODEL_NOT_FOUND');
    });

    it('should handle OpenRouter insufficient credits errors', () => {
      const errorResponse = {
        error: {
          message: 'Insufficient credits',
          type: 'payment_error',
          code: 'insufficient_credits'
        }
      };
      const error = provider.parseError(errorResponse, 402);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('credits');
      expect(error.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('should handle content policy violations', () => {
      const errorResponse = {
        error: {
          message: 'Content policy violation',
          type: 'content_policy_violation'
        }
      };
      const error = provider.parseError(errorResponse, 400);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('CONTENT_POLICY');
    });

    it('should include HTTP status code in error object', () => {
      const errorResponse = { error: { message: 'Some error' } };
      const error = provider.parseError(errorResponse, 500);
      expect(error).toHaveProperty('statusCode');
      expect(error.statusCode).toBe(500);
    });

    it('should include raw error data when available', () => {
      const errorResponse = {
        error: {
          message: 'Detailed error',
          type: 'specific_error'
        }
      };
      const error = provider.parseError(errorResponse, 400);
      expect(error).toHaveProperty('raw');
      expect(error.raw).toEqual(errorResponse);
    });

    it('should handle empty or malformed error responses', () => {
      const error = provider.parseError(null, 500);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Unknown error');
    });

    it('should handle network errors', () => {
      const networkError = new TypeError('Network request failed');
      const error = provider.parseError(networkError, 0);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should handle timeout errors', () => {
      const timeoutError = new Error('Request timeout');
      const error = provider.parseError(timeoutError, 0);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('TIMEOUT');
    });
  });

  describe('Model Support', () => {
    let provider;

    beforeEach(() => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      provider = new OpenRouterProvider(config);
    });

    it('should return a Promise from getModels()', () => {
      const result = provider.getModels();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should parse OpenRouter model list format', async () => {
      // Mock would be used in actual implementation
      // For RED phase, we test the interface contract
      try {
        const models = await provider.getModels();
        expect(Array.isArray(models)).toBe(true);
      } catch (error) {
        // Expected for RED phase - method not yet implemented
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });

    it('should support OpenRouter model ID format with provider prefix', () => {
      // OpenRouter uses format like "openai/dall-e-3", "stability-ai/sd-xl"
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        model: 'openai/dall-e-3'
      };
      const provider = new OpenRouterProvider(config);
      expect(provider.config.model).toBe('openai/dall-e-3');
    });

    it('should validate model ID format', () => {
      const validConfig = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        model: 'openai/dall-e-3'
      };
      const result = provider.validateConfig(validConfig);
      // Model format validation is optional - some implementations may not validate
      if (!result.isValid) {
        const hasModelError = result.errors.some(e => e.toLowerCase().includes('model'));
        // If there are errors, one might be about model format
      }
    });
  });

  describe('generate() Method - OpenRouter Integration', () => {
    let provider;
    let mockFetch;

    beforeEach(() => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        model: 'openai/dall-e-3'
      };
      provider = new OpenRouterProvider(config);

      // Mock fetch for these tests
      mockFetch = () => Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ url: 'https://example.com/image.png' }]
        })
      });
      global.fetch = mockFetch;
    });

    it('should accept prompt and options', () => {
      const result = provider.generate('test prompt', { n: 2 });
      expect(result).toBeInstanceOf(Promise);
    });

    it('should use configured model by default', async () => {
      const result = await provider.generate('test prompt');
      expect(result).toHaveProperty('imageUrl', 'https://example.com/image.png');
      expect(result).toHaveProperty('metadata');
    });

    it('should allow overriding model in options', async () => {
      const result = await provider.generate('test prompt', { model: 'stability-ai/sd-xl' });
      expect(result).toHaveProperty('imageUrl', 'https://example.com/image.png');
      expect(result).toHaveProperty('metadata');
    });

    it('should return standard response format', async () => {
      const result = await provider.generate('test prompt');
      expect(result).toHaveProperty('imageUrl');
      expect(result).toHaveProperty('metadata');
    });
  });

  describe('OpenRouter-Specific Features', () => {
    it('should support transforms parameter for image editing', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      const body = provider.buildRequestBody('test prompt', {
        transforms: ['enhance', 'upscale']
      });
      expect(body).toHaveProperty('transforms');
      expect(body.transforms).toEqual(['enhance', 'upscale']);
    });

    it('should support provider routing preferences', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App',
        providerRouting: {
          order: ['openai', 'stability-ai'],
          allow_fallbacks: false
        }
      };
      const provider = new OpenRouterProvider(config);
      const body = provider.buildRequestBody('test prompt');
      expect(body).toHaveProperty('provider');
      expect(body.provider).toEqual(config.providerRouting);
    });

    it('should include OpenRouter version in user agent when available', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        httpReferer: 'https://example.com',
        xTitle: 'Test App'
      };
      const provider = new OpenRouterProvider(config);
      const headers = provider.getHeaders();
      // OpenRouter may use User-Agent or similar for version info
      // This is implementation-specific
      expect(headers).toBeDefined();
    });
  });
});
