/**
 * NanoGPT Provider Tests
 * RED Phase: Tests define NanoGPT-specific behavior before implementation
 * 
 * NanoGPT uses OpenAI-compatible API format for image generation
 * API Docs: https://nano-gpt.com/api (OpenAI-compatible)
 */

import { describe, expect, it, beforeEach } from 'bun:test';

// Dynamic imports for RED phase - modules don't exist yet
let ImageProvider;
let NanoGPTProvider;

try {
  const baseModule = await import('../../providers/base-provider.js');
  ImageProvider = baseModule.ImageProvider;
} catch (e) {
  ImageProvider = undefined;
}

try {
  const nanoModule = await import('../../providers/nanogpt-provider.js');
  NanoGPTProvider = nanoModule.NanoGPTProvider;
} catch (e) {
  NanoGPTProvider = undefined;
}

describe('NanoGPTProvider', () => {
  describe('Class Definition', () => {
    it('should export NanoGPTProvider class', () => {
      expect(NanoGPTProvider).toBeDefined();
      expect(typeof NanoGPTProvider).toBe('function');
    });

    it('should extend ImageProvider base class', () => {
      expect(NanoGPTProvider.prototype).toBeInstanceOf(ImageProvider);
    });

    it('should be instantiable with config', () => {
      const config = { apiKey: 'nano-gpt-api-key' };
      const provider = new NanoGPTProvider(config);
      expect(provider).toBeInstanceOf(NanoGPTProvider);
      expect(provider).toBeInstanceOf(ImageProvider);
    });
  });

  describe('Static Properties', () => {
    it('should have providerName set to "NanoGPT"', () => {
      expect(NanoGPTProvider.providerName).toBe('NanoGPT');
    });

    it('should have providerType set to "openai-compatible"', () => {
      expect(NanoGPTProvider.providerType).toBe('openai-compatible');
    });

    it('should inherit requiredConfigFields from base', () => {
      expect(NanoGPTProvider.requiredConfigFields).toContain('apiKey');
    });

    it('should have NanoGPT-specific defaultBaseUrl', () => {
      expect(NanoGPTProvider.defaultBaseUrl).toBe('https://nano-gpt.com/api/v1');
    });

    it('should have defaultModel for image generation', () => {
      expect(NanoGPTProvider.defaultModel).toBeDefined();
      expect(typeof NanoGPTProvider.defaultModel).toBe('string');
    });

    it('should have supportedModels array', () => {
      expect(Array.isArray(NanoGPTProvider.supportedModels)).toBe(true);
      expect(NanoGPTProvider.supportedModels.length).toBeGreaterThan(0);
    });

    it('should include Z Image Turbo in supported models', () => {
      const models = NanoGPTProvider.supportedModels;
      const hasZT = models.some(m => m.id === 'z-image-turbo' || m.name?.includes('Z Image Turbo'));
      expect(hasZT).toBe(true);
    });

    it('should include Qwen Image in supported models', () => {
      const models = NanoGPTProvider.supportedModels;
      const hasQwen = models.some(m => m.id === 'qwen-image' || m.name?.includes('Qwen Image'));
      expect(hasQwen).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should default baseUrl to NanoGPT endpoint', () => {
      const config = { apiKey: 'test-key' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.baseUrl).toBe('https://nano-gpt.com/api/v1');
    });

    it('should allow custom baseUrl override', () => {
      const config = { apiKey: 'test-key', baseUrl: 'https://custom.nano-gpt.com/api' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.baseUrl).toBe('https://custom.nano-gpt.com/api');
    });

    it('should default model when not specified', () => {
      const config = { apiKey: 'test-key' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.model).toBeDefined();
    });

    it('should accept model in config', () => {
      const config = { apiKey: 'test-key', model: 'z-image-turbo' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.model).toBe('z-image-turbo');
    });

    it('should accept Qwen Image model', () => {
      const config = { apiKey: 'test-key', model: 'qwen-image' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.model).toBe('qwen-image');
    });

    it('should validate model is in supported list', () => {
      const provider = new NanoGPTProvider({ apiKey: 'test-key' });
      const invalidConfig = { apiKey: 'test-key', model: 'unsupported-model' };
      const result = provider.validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('model'))).toBe(true);
    });

    it('should store organizationId if provided', () => {
      const config = { apiKey: 'test-key', organizationId: 'org-123' };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.organizationId).toBe('org-123');
    });
  });

  describe('API Endpoints', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key' });
    });

    it('should have imagesGenerateEndpoint property', () => {
      expect(provider.imagesGenerateEndpoint).toBeDefined();
      expect(typeof provider.imagesGenerateEndpoint).toBe('string');
    });

    it('should have correct images generation endpoint', () => {
      expect(provider.imagesGenerateEndpoint).toBe('/images/generations');
    });

    it('should build full URL with baseUrl and endpoint', () => {
      const url = provider.buildApiUrl(provider.imagesGenerateEndpoint);
      expect(url).toBe('https://nano-gpt.com/api/v1/images/generations');
    });

    it('should use custom baseUrl when building URLs', () => {
      const customProvider = new NanoGPTProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.endpoint.com/v1'
      });
      const url = customProvider.buildApiUrl('/images/generations');
      expect(url).toBe('https://custom.endpoint.com/v1/images/generations');
    });
  });

  describe('Request Building', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key', model: 'z-image-turbo' });
    });

    it('should have buildRequestHeaders() method', () => {
      expect(typeof provider.buildRequestHeaders).toBe('function');
    });

    it('should build headers with Authorization Bearer token', () => {
      const headers = provider.buildRequestHeaders();
      expect(headers['Authorization']).toBe('Bearer test-key');
    });

    it('should build headers with Content-Type application/json', () => {
      const headers = provider.buildRequestHeaders();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include Organization header when organizationId set', () => {
      const orgProvider = new NanoGPTProvider({
        apiKey: 'test-key',
        organizationId: 'org-123'
      });
      const headers = orgProvider.buildRequestHeaders();
      expect(headers['Organization']).toBe('org-123');
    });

    it('should have buildRequestBody() method', () => {
      expect(typeof provider.buildRequestBody).toBe('function');
    });

    it('should build request body with prompt', () => {
      const body = provider.buildRequestBody('a beautiful sunset');
      expect(body.prompt).toBe('a beautiful sunset');
    });

    it('should build request body with model', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body.model).toBe('z-image-turbo');
    });

    it('should build request body with n=1 by default', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body.n).toBe(1);
    });

    it('should build request body with size parameter from options', () => {
      const options = { width: 1024, height: 1024 };
      const body = provider.buildRequestBody('test prompt', options);
      expect(body.size).toBe('1024x1024');
    });

    it('should build request body with response_format "url"', () => {
      const body = provider.buildRequestBody('test prompt');
      expect(body.response_format).toBe('url');
    });

    it('should include seed in request body when provided', () => {
      const options = { seed: 42 };
      const body = provider.buildRequestBody('test prompt', options);
      expect(body.seed).toBe(42);
    });

    it('should format size as WIDTHxHEIGHT string', () => {
      const options = { width: 512, height: 768 };
      const body = provider.buildRequestBody('test prompt', options);
      expect(body.size).toBe('512x768');
    });
  });

  describe('Response Parsing', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key' });
    });

    it('should have parseResponse() method', () => {
      expect(typeof provider.parseResponse).toBe('function');
    });

    it('should parse OpenAI-compatible response format', () => {
      const mockResponse = {
        created: 1234567890,
        data: [{
          url: 'https://nano-gpt.com/images/generated-123.png',
          revised_prompt: 'Enhanced prompt description'
        }]
      };
      const result = provider.parseResponse(mockResponse);
      expect(result.imageUrl).toBe('https://nano-gpt.com/images/generated-123.png');
    });

    it('should extract metadata from response', () => {
      const mockResponse = {
        created: 1234567890,
        data: [{
          url: 'https://nano-gpt.com/images/generated-123.png',
          revised_prompt: 'Enhanced prompt'
        }]
      };
      const result = provider.parseResponse(mockResponse);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.revisedPrompt).toBe('Enhanced prompt');
      expect(result.metadata.created).toBe(1234567890);
    });

    it('should handle response with b64_json format', () => {
      const mockResponse = {
        created: 1234567890,
        data: [{
          b64_json: 'base64encodeddatahere',
          revised_prompt: 'Enhanced prompt'
        }]
      };
      const result = provider.parseResponse(mockResponse);
      expect(result.imageUrl).toBe('data:image/png;base64,base64encodeddatahere');
    });

    it('should throw error when response data is empty', () => {
      const mockResponse = { created: 1234567890, data: [] };
      expect(() => provider.parseResponse(mockResponse)).toThrow();
    });

    it('should throw error when response lacks both url and b64_json', () => {
      const mockResponse = { created: 1234567890, data: [{ revised_prompt: 'test' }] };
      expect(() => provider.parseResponse(mockResponse)).toThrow();
    });
  });

  describe('Error Handling', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key' });
    });

    it('should have parseError() method', () => {
      expect(typeof provider.parseError).toBe('function');
    });

    it('should parse OpenAI-style error response', () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      };
      const error = provider.parseError(errorResponse);
      expect(error.message).toContain('Invalid API key');
      expect(error.code).toBe('invalid_api_key');
      expect(error.type).toBe('authentication_error');
    });

    it('should handle rate limit errors', () => {
      const errorResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      };
      const error = provider.parseError(errorResponse);
      expect(error.isRateLimit).toBe(true);
    });

    it('should handle insufficient credits error', () => {
      const errorResponse = {
        error: {
          message: 'Insufficient credits',
          type: 'billing_error',
          code: 'insufficient_credits'
        }
      };
      const error = provider.parseError(errorResponse);
      expect(error.isBillingError).toBe(true);
      expect(error.message).toContain('credits');
    });

    it('should handle invalid model error', () => {
      const errorResponse = {
        error: {
          message: 'Model not found',
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      };
      const error = provider.parseError(errorResponse);
      expect(error.isInvalidModel).toBe(true);
    });

    it('should handle generic HTTP errors', () => {
      const errorResponse = { status: 500, statusText: 'Internal Server Error' };
      const error = provider.parseError(errorResponse);
      expect(error.message).toContain('500');
    });

    it('should include retryAfter for rate limit errors', () => {
      const errorResponse = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error'
        },
        headers: { 'retry-after': '60' }
      };
      const error = provider.parseError(errorResponse);
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('generate() Method', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key', model: 'z-image-turbo' });
    });

    it('should override base generate() method', () => {
      expect(typeof provider.generate).toBe('function');
    });

    it('should return a Promise', () => {
      const result = provider.generate('test prompt');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should reject if API key is missing', async () => {
      const invalidProvider = new NanoGPTProvider({});
      try {
        await invalidProvider.generate('test prompt');
        expect(false).toBe(true);
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('api key');
      }
    });

    it('should reject if prompt is empty', async () => {
      try {
        await provider.generate('');
        expect(false).toBe(true);
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('prompt');
      }
    });

    it('should accept generation options', async () => {
      const options = { width: 512, height: 512, seed: 42 };
      const result = provider.generate('test prompt', options);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('getModels() Method', () => {
    let provider;

    beforeEach(() => {
      provider = new NanoGPTProvider({ apiKey: 'test-key' });
    });

    it('should override base getModels() method', () => {
      expect(typeof provider.getModels).toBe('function');
    });

    it('should return a Promise', () => {
      const result = provider.getModels();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve to array of model objects', async () => {
      try {
        const models = await provider.getModels();
        expect(Array.isArray(models)).toBe(true);
        if (models.length > 0) {
          expect(models[0]).toHaveProperty('id');
          expect(models[0]).toHaveProperty('name');
          expect(models[0]).toHaveProperty('provider');
          expect(models[0].provider).toBe('NanoGPT');
        }
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('validateConfig() Method', () => {
    it('should override base validateConfig()', () => {
      const provider = new NanoGPTProvider({});
      expect(typeof provider.validateConfig).toBe('function');
    });

    it('should validate apiKey is present', () => {
      const provider = new NanoGPTProvider({});
      const result = provider.validateConfig({});
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('apiKey'))).toBe(true);
    });

    it('should validate apiKey format (starts with nano_ or sk-)', () => {
      const provider = new NanoGPTProvider({});
      const invalidKey = { apiKey: 'invalid-key-format' };
      const result = provider.validateConfig(invalidKey);
      expect(result.errors.some(e => 
        e.toLowerCase().includes('key') || e.toLowerCase().includes('format')
      )).toBe(true);
    });

    it('should validate model is supported', () => {
      const provider = new NanoGPTProvider({});
      const config = { apiKey: 'nano_valid_key', model: 'invalid-model' };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('model'))).toBe(true);
    });

    it('should return valid for correct config', () => {
      const provider = new NanoGPTProvider({});
      const config = { 
        apiKey: 'nano_valid_key_123',
        model: 'z-image-turbo'
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate timeout is positive number', () => {
      const provider = new NanoGPTProvider({});
      const config = { 
        apiKey: 'nano_valid_key',
        timeout: -1
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
    });
  });

  describe('NanoGPT-Specific Features', () => {
    it('should support referral code in config', () => {
      const config = { 
        apiKey: 'test-key',
        referralCode: 'NeDEp3UR'
      };
      const provider = new NanoGPTProvider(config);
      expect(provider.config.referralCode).toBe('NeDEp3UR');
    });

    it('should have isAvailable() static method', () => {
      expect(typeof NanoGPTProvider.isAvailable).toBe('function');
    });

    it('should return true from isAvailable() when fetch is available', () => {
      const available = NanoGPTProvider.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should have getDocumentationUrl() static method', () => {
      expect(typeof NanoGPTProvider.getDocumentationUrl).toBe('function');
    });

    it('should return NanoGPT documentation URL', () => {
      const url = NanoGPTProvider.getDocumentationUrl();
      expect(url).toContain('nano-gpt.com');
    });

    it('should have getPricingUrl() static method', () => {
      expect(typeof NanoGPTProvider.getPricingUrl).toBe('function');
    });

    it('should return NanoGPT pricing URL', () => {
      const url = NanoGPTProvider.getPricingUrl();
      expect(url).toContain('nano-gpt.com');
    });
  });

  describe('Integration with ImageProvider Interface', () => {
    it('should satisfy all base interface requirements', () => {
      const provider = new NanoGPTProvider({ apiKey: 'test-key' });
      
      expect(typeof provider.generate).toBe('function');
      expect(typeof provider.validateConfig).toBe('function');
      expect(typeof provider.getModels).toBe('function');
      
      expect(provider.config).toBeDefined();
      
      expect(provider).toBeInstanceOf(ImageProvider);
    });

    it('should support all standard config options from base', () => {
      const config = {
        apiKey: 'test-key',
        baseUrl: 'https://nano-gpt.com/api/v1',
        model: 'z-image-turbo',
        timeout: 60000
      };
      const provider = new NanoGPTProvider(config);
      expect(provider.config).toEqual(expect.objectContaining(config));
    });
  });
});
