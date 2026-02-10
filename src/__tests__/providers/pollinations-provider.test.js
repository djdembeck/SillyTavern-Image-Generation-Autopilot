/**
 * PollinationsProvider Tests
 * RED Phase: Tests define Pollinations-specific behavior before implementation
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { PollinationsProvider } from '../../providers/pollinations-provider.js';
import { ImageProvider } from '../../providers/base-provider.js';

describe('PollinationsProvider', () => {
  describe('Class Definition', () => {
    it('should export PollinationsProvider class', () => {
      expect(PollinationsProvider).toBeDefined();
      expect(typeof PollinationsProvider).toBe('function');
    });

    it('should extend ImageProvider base class', () => {
      expect(PollinationsProvider.prototype).toBeInstanceOf(ImageProvider);
    });

    it('should be instantiable without API key (Pollinations is keyless)', () => {
      const provider = new PollinationsProvider({});
      expect(provider).toBeInstanceOf(PollinationsProvider);
      expect(provider).toBeInstanceOf(ImageProvider);
    });

    it('should accept config with model parameter', () => {
      const config = { model: 'flux' };
      const provider = new PollinationsProvider(config);
      expect(provider.config.model).toBe('flux');
    });
  });

  describe('Static Properties', () => {
    it('should have providerName set to "Pollinations"', () => {
      expect(PollinationsProvider.providerName).toBe('Pollinations');
    });

    it('should have providerType set to "pollinations"', () => {
      expect(PollinationsProvider.providerType).toBe('pollinations');
    });

    it('should have requiredConfigFields array', () => {
      expect(Array.isArray(PollinationsProvider.requiredConfigFields)).toBe(true);
    });

    it('should NOT require apiKey (Pollinations is keyless by default)', () => {
      const required = PollinationsProvider.requiredConfigFields;
      expect(required).not.toContain('apiKey');
    });

    it('should have defaultBaseUrl pointing to pollinations.ai', () => {
      expect(PollinationsProvider.defaultBaseUrl).toBe('https://image.pollinations.ai');
    });
  });

  describe('Pollinations-Specific Configuration', () => {
    it('should accept seed parameter for reproducible generations', () => {
      const config = { seed: 42 };
      const provider = new PollinationsProvider(config);
      expect(provider.config.seed).toBe(42);
    });

    it('should accept nologo parameter to disable watermark', () => {
      const config = { nologo: true };
      const provider = new PollinationsProvider(config);
      expect(provider.config.nologo).toBe(true);
    });

    it('should accept enhance parameter for prompt enhancement', () => {
      const config = { enhance: true };
      const provider = new PollinationsProvider(config);
      expect(provider.config.enhance).toBe(true);
    });

    it('should accept private parameter for private generations', () => {
      const config = { private: true, apiKey: 'optional-key' };
      const provider = new PollinationsProvider(config);
      expect(provider.config.private).toBe(true);
    });

    it('should default to safe mode being off', () => {
      const provider = new PollinationsProvider({});
      expect(provider.config.safe).toBe(false);
    });

    it('should accept safe parameter for safe mode', () => {
      const config = { safe: true };
      const provider = new PollinationsProvider(config);
      expect(provider.config.safe).toBe(true);
    });

    it('should store default dimensions in config', () => {
      const config = { width: 1024, height: 768 };
      const provider = new PollinationsProvider(config);
      expect(provider.config.width).toBe(1024);
      expect(provider.config.height).toBe(768);
    });
  });

  describe('API Endpoint Structure', () => {
    let provider;

    beforeEach(() => {
      provider = new PollinationsProvider({});
    });

    it('should have buildUrl method for constructing GET URLs', () => {
      expect(typeof provider.buildUrl).toBe('function');
    });

    it('should build URL with encoded prompt in path', () => {
      const url = provider.buildUrl('a beautiful sunset');
      expect(url).toContain('/prompt/');
      expect(url).toContain(encodeURIComponent('a beautiful sunset'));
    });

    it('should include width parameter in query string', () => {
      const url = provider.buildUrl('test', { width: 512 });
      expect(url).toContain('width=512');
    });

    it('should include height parameter in query string', () => {
      const url = provider.buildUrl('test', { height: 768 });
      expect(url).toContain('height=768');
    });

    it('should include seed parameter in query string', () => {
      const url = provider.buildUrl('test', { seed: 12345 });
      expect(url).toContain('seed=12345');
    });

    it('should include model parameter in query string', () => {
      const url = provider.buildUrl('test', { model: 'flux' });
      expect(url).toContain('model=flux');
    });

    it('should include nologo parameter as true/false string', () => {
      const url = provider.buildUrl('test', { nologo: true });
      expect(url).toContain('nologo=true');
    });

    it('should include enhance parameter when true', () => {
      const url = provider.buildUrl('test', { enhance: true });
      expect(url).toContain('enhance=true');
    });

    it('should include safe parameter when true', () => {
      const url = provider.buildUrl('test', { safe: true });
      expect(url).toContain('safe=true');
    });

    it('should merge default config with request options', () => {
      const providerWithDefaults = new PollinationsProvider({
        width: 1024,
        height: 1024,
        seed: 42,
        model: 'flux'
      });
      const url = providerWithDefaults.buildUrl('test');
      expect(url).toContain('width=1024');
      expect(url).toContain('height=1024');
      expect(url).toContain('seed=42');
      expect(url).toContain('model=flux');
    });

    it('should allow request options to override defaults', () => {
      const providerWithDefaults = new PollinationsProvider({
        width: 1024,
        height: 1024
      });
      const url = providerWithDefaults.buildUrl('test', { width: 512 });
      expect(url).toContain('width=512');
      expect(url).toContain('height=1024');
    });
  });

  describe('Request/Response Handling', () => {
    let provider;

    beforeEach(() => {
      provider = new PollinationsProvider({});
    });

    it('should have generate() method that returns a Promise', () => {
      const result = provider.generate('test prompt');
      expect(result).toBeInstanceOf(Promise);
    });

    it('generate() should accept options object', () => {
      const result = provider.generate('test', { width: 512, height: 512 });
      expect(result).toBeInstanceOf(Promise);
    });

    it('generate() should resolve to object with imageUrl', async () => {
      const result = await provider.generate('test prompt');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('imageUrl');
      expect(typeof result.imageUrl).toBe('string');
    });

    it('generate() should resolve to object with metadata', async () => {
      const result = await provider.generate('test prompt');
      expect(result).toHaveProperty('metadata');
      expect(typeof result.metadata).toBe('object');
    });

    it('metadata should include prompt', async () => {
      const result = await provider.generate('a beautiful sunset');
      expect(result.metadata).toHaveProperty('prompt');
      expect(result.metadata.prompt).toBe('a beautiful sunset');
    });

    it('metadata should include seed if provided', async () => {
      const result = await provider.generate('test', { seed: 12345 });
      expect(result.metadata).toHaveProperty('seed');
      expect(result.metadata.seed).toBe(12345);
    });

    it('metadata should include model used', async () => {
      const providerWithModel = new PollinationsProvider({ model: 'flux' });
      const result = await providerWithModel.generate('test');
      expect(result.metadata).toHaveProperty('model');
      expect(result.metadata.model).toBe('flux');
    });

    it('metadata should include dimensions', async () => {
      const result = await provider.generate('test', { width: 1024, height: 768 });
      expect(result.metadata).toHaveProperty('width');
      expect(result.metadata).toHaveProperty('height');
      expect(result.metadata.width).toBe(1024);
      expect(result.metadata.height).toBe(768);
    });

    it('metadata should include generation timestamp', async () => {
      const result = await provider.generate('test');
      expect(result.metadata).toHaveProperty('timestamp');
      expect(typeof result.metadata.timestamp).toBe('number');
    });

    it('metadata should include provider name', async () => {
      const result = await provider.generate('test');
      expect(result.metadata).toHaveProperty('provider');
      expect(result.metadata.provider).toBe('pollinations');
    });
  });

  describe('Model Management', () => {
    let provider;

    beforeEach(() => {
      provider = new PollinationsProvider({});
    });

    it('should have getModels() method that returns a Promise', () => {
      const result = provider.getModels();
      expect(result).toBeInstanceOf(Promise);
    });

    it('getModels() should resolve to array of model objects', async () => {
      const models = await provider.getModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('each model should have id and name properties', async () => {
      const models = await provider.getModels();
      if (models.length > 0) {
        expect(models[0]).toHaveProperty('id');
        expect(models[0]).toHaveProperty('name');
        expect(typeof models[0].id).toBe('string');
        expect(typeof models[0].name).toBe('string');
      }
    });

    it('should include flux model', async () => {
      const models = await provider.getModels();
      const fluxModel = models.find(m => m.id === 'flux');
      expect(fluxModel).toBeDefined();
    });

    it('should include turbo model', async () => {
      const models = await provider.getModels();
      const turboModel = models.find(m => m.id === 'turbo');
      expect(turboModel).toBeDefined();
    });

    it('should include default model flag on recommended model', async () => {
      const models = await provider.getModels();
      const defaultModel = models.find(m => m.default === true);
      expect(defaultModel).toBeDefined();
    });
  });

  describe('Config Validation', () => {
    it('should validateConfig() return validation result', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({});
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('isValid');
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should validate empty config as valid (no required fields)', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({});
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate width is a positive number', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ width: -100 });
      expect(result.isValid).toBe(false);
      const hasWidthError = result.errors.some(e => 
        e.toLowerCase().includes('width')
      );
      expect(hasWidthError).toBe(true);
    });

    it('should validate height is a positive number', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ height: 0 });
      expect(result.isValid).toBe(false);
      const hasHeightError = result.errors.some(e => 
        e.toLowerCase().includes('height')
      );
      expect(hasHeightError).toBe(true);
    });

    it('should validate seed is a number when provided', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ seed: 'not-a-number' });
      expect(result.isValid).toBe(false);
      const hasSeedError = result.errors.some(e => 
        e.toLowerCase().includes('seed')
      );
      expect(hasSeedError).toBe(true);
    });

    it('should validate model is a non-empty string when provided', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ model: '' });
      expect(result.isValid).toBe(false);
      const hasModelError = result.errors.some(e => 
        e.toLowerCase().includes('model')
      );
      expect(hasModelError).toBe(true);
    });

    it('should validate safe mode is boolean', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ safe: 'yes' });
      expect(result.isValid).toBe(false);
      const hasSafeError = result.errors.some(e => 
        e.toLowerCase().includes('safe')
      );
      expect(hasSafeError).toBe(true);
    });

    it('should validate nologo is boolean', () => {
      const provider = new PollinationsProvider({});
      const result = provider.validateConfig({ nologo: 1 });
      expect(result.isValid).toBe(false);
      const hasNologoError = result.errors.some(e => 
        e.toLowerCase().includes('nologo')
      );
      expect(hasNologoError).toBe(true);
    });

    it('should accept valid config with all options', () => {
      const provider = new PollinationsProvider({});
      const config = {
        model: 'flux',
        width: 1024,
        height: 1024,
        seed: 42,
        nologo: true,
        enhance: false,
        safe: false,
        private: false
      };
      const result = provider.validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Pollinations-Specific Error Handling', () => {
    let provider;

    beforeEach(() => {
      provider = new PollinationsProvider({});
    });

    it('should handle network errors with meaningful message', async () => {
      try {
        await provider.generate('test');
      } catch (error) {
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    });

    it('should handle rate limiting (429 status)', async () => {
      try {
        await provider.generate('test');
      } catch (error) {
        if (error.code === 'RATE_LIMITED' || error.status === 429) {
          expect(error.message.toLowerCase()).toContain('rate');
        }
      }
    });

    it('should handle invalid model errors', async () => {
      const providerWithBadModel = new PollinationsProvider({ model: 'invalid-model-xyz' });
      try {
        await providerWithBadModel.generate('test');
      } catch (error) {
        if (error.message.toLowerCase().includes('model')) {
          expect(error.message.toLowerCase()).toContain('model');
        }
      }
    });

    it('should handle content policy violations (safe mode)', async () => {
      const safeProvider = new PollinationsProvider({ safe: true });
      try {
        await safeProvider.generate('test');
      } catch (error) {
        if (error.code === 'CONTENT_POLICY_VIOLATION') {
          expect(error.message.toLowerCase()).toContain('content');
        }
      }
    });

    it('should include request URL in error for debugging', async () => {
      try {
        await provider.generate('test');
      } catch (error) {
        if (error.requestUrl) {
          expect(typeof error.requestUrl).toBe('string');
          expect(error.requestUrl).toContain('pollinations.ai');
        }
      }
    });
  });

  describe('Prompt Encoding', () => {
    let provider;

    beforeEach(() => {
      provider = new PollinationsProvider({});
    });

    it('should properly encode special characters in prompts', () => {
      const url = provider.buildUrl('hello & goodbye');
      expect(url).not.toContain('hello & goodbye');
      expect(url).toContain(encodeURIComponent('hello & goodbye'));
    });

    it('should handle unicode characters in prompts', () => {
      const url = provider.buildUrl('日本語テキスト');
      expect(url).toContain(encodeURIComponent('日本語テキスト'));
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'a '.repeat(1000) + 'beautiful sunset';
      const url = provider.buildUrl(longPrompt);
      expect(url.length).toBeGreaterThan(100);
      expect(url).toContain(encodeURIComponent('beautiful sunset'));
    });

    it('should handle prompts with query string-like characters', () => {
      const url = provider.buildUrl('test?param=value&other=123');
      expect(url).not.toContain('?param=value');
      expect(url).toContain(encodeURIComponent('test?param=value&other=123'));
    });
  });

  describe('Default Configuration', () => {
    it('should have sensible defaults for dimensions', () => {
      const provider = new PollinationsProvider({});
      expect(provider.config.width).toBe(1024);
      expect(provider.config.height).toBe(1024);
    });

    it('should default to no logo (nologo: true)', () => {
      const provider = new PollinationsProvider({});
      expect(provider.config.nologo).toBe(true);
    });

    it('should default to no enhancement', () => {
      const provider = new PollinationsProvider({});
      expect(provider.config.enhance).toBe(false);
    });

    it('should default to flux model', () => {
      const provider = new PollinationsProvider({});
      expect(provider.config.model).toBe('flux');
    });

    it('should apply defaults when partial config provided', () => {
      const provider = new PollinationsProvider({ width: 512 });
      expect(provider.config.width).toBe(512);
      expect(provider.config.height).toBe(1024);
      expect(provider.config.model).toBe('flux');
    });
  });
});
