/**
 * Base ImageProvider Interface Tests
 * RED Phase: Tests define the interface before implementation
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { ImageProvider } from '../../providers/base-provider.js';

describe('ImageProvider Interface', () => {
  describe('Class Definition', () => {
    it('should export ImageProvider class', () => {
      expect(ImageProvider).toBeDefined();
      expect(typeof ImageProvider).toBe('function');
    });

    it('should be a class that can be instantiated', () => {
      const config = { apiKey: 'test-key', baseUrl: 'http://test.com' };
      const provider = new ImageProvider(config);
      expect(provider).toBeInstanceOf(ImageProvider);
    });

    it('should store config in constructor', () => {
      const config = { apiKey: 'test-key', baseUrl: 'http://test.com', model: 'test-model' };
      const provider = new ImageProvider(config);
      expect(provider.config).toEqual(config);
    });

    it('should accept empty config object', () => {
      const provider = new ImageProvider({});
      expect(provider).toBeInstanceOf(ImageProvider);
      expect(provider.config).toEqual({});
    });

    it('should accept undefined config and default to empty object', () => {
      const provider = new ImageProvider();
      expect(provider).toBeInstanceOf(ImageProvider);
      expect(provider.config).toEqual({});
    });
  });

  describe('Required Methods', () => {
    let provider;

    beforeEach(() => {
      provider = new ImageProvider({ apiKey: 'test-key' });
    });

    it('should have generate() method', () => {
      expect(typeof provider.generate).toBe('function');
    });

    it('should have validateConfig() method', () => {
      expect(typeof provider.validateConfig).toBe('function');
    });

    it('should have getModels() method', () => {
      expect(typeof provider.getModels).toBe('function');
    });
  });

  describe('generate() Method Signature', () => {
    let provider;

    beforeEach(() => {
      provider = new ImageProvider({ apiKey: 'test-key' });
    });

    it('should accept prompt as first argument', async () => {
      const result = provider.generate('a beautiful landscape');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should accept options as second argument', async () => {
      const options = { width: 512, height: 512, seed: 42 };
      const result = provider.generate('a beautiful landscape', options);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should work with undefined options', async () => {
      const result = provider.generate('a beautiful landscape');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should return a Promise that resolves to an object with imageUrl', async () => {
      try {
        const result = await provider.generate('test prompt');
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('imageUrl');
      } catch (error) {
        // Expected for base class - should throw "not implemented"
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });

    it('should return a Promise that resolves to an object with metadata', async () => {
      try {
        const result = await provider.generate('test prompt');
        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('metadata');
        expect(typeof result.metadata).toBe('object');
      } catch (error) {
        // Expected for base class - should throw "not implemented"
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });
  });

  describe('validateConfig() Method', () => {
    it('should accept config object as argument', () => {
      const provider = new ImageProvider({});
      const config = { apiKey: 'test-key', baseUrl: 'http://test.com' };
      const result = provider.validateConfig(config);
      expect(typeof result).toBe('object');
    });

    it('should return validation result with isValid boolean', () => {
      const provider = new ImageProvider({});
      const config = { apiKey: 'test-key' };
      const result = provider.validateConfig(config);
      expect(result).toHaveProperty('isValid');
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should return validation result with errors array when invalid', () => {
      const provider = new ImageProvider({});
      const invalidConfig = {};
      const result = provider.validateConfig(invalidConfig);
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return empty errors array when config is valid', () => {
      const provider = new ImageProvider({});
      const validConfig = { apiKey: 'valid-key', baseUrl: 'http://test.com', model: 'test-model' };
      const result = provider.validateConfig(validConfig);
      if (result.isValid) {
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should validate required fields: apiKey', () => {
      const provider = new ImageProvider({});
      const configWithoutKey = { baseUrl: 'http://test.com' };
      const result = provider.validateConfig(configWithoutKey);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate required fields: baseUrl', () => {
      const provider = new ImageProvider({});
      const configWithoutUrl = { apiKey: 'test-key' };
      const result = provider.validateConfig(configWithoutUrl);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate timeout is a positive number', () => {
      const provider = new ImageProvider({});
      const configWithInvalidTimeout = { 
        apiKey: 'test-key', 
        baseUrl: 'http://test.com',
        timeout: 'invalid'
      };
      const result = provider.validateConfig(configWithInvalidTimeout);
      if (!result.isValid) {
        const hasTimeoutError = result.errors.some(e => e.toLowerCase().includes('timeout'));
        expect(hasTimeoutError).toBe(true);
      }
    });

    it('should validate model field when provided', () => {
      const provider = new ImageProvider({});
      const configWithInvalidModel = {
        apiKey: 'test-key',
        baseUrl: 'http://test.com',
        model: ''
      };
      const result = provider.validateConfig(configWithInvalidModel);
      if (!result.isValid) {
        const hasModelError = result.errors.some(e => e.toLowerCase().includes('model'));
        expect(hasModelError).toBe(true);
      }
    });
  });

  describe('getModels() Method', () => {
    let provider;

    beforeEach(() => {
      provider = new ImageProvider({ apiKey: 'test-key', baseUrl: 'http://test.com' });
    });

    it('should return a Promise', () => {
      const result = provider.getModels();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve to an array', async () => {
      try {
        const models = await provider.getModels();
        expect(Array.isArray(models)).toBe(true);
      } catch (error) {
        // Expected for base class - should throw "not implemented"
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });

    it('should return models with id and name properties', async () => {
      try {
        const models = await provider.getModels();
        if (models.length > 0) {
          expect(models[0]).toHaveProperty('id');
          expect(models[0]).toHaveProperty('name');
        }
      } catch (error) {
        // Expected for base class - should throw "not implemented"
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });
  });

  describe('Config Schema', () => {
    it('should accept apiKey in config', () => {
      const config = { apiKey: 'my-api-key' };
      const provider = new ImageProvider(config);
      expect(provider.config.apiKey).toBe('my-api-key');
    });

    it('should accept baseUrl in config', () => {
      const config = { baseUrl: 'https://api.example.com' };
      const provider = new ImageProvider(config);
      expect(provider.config.baseUrl).toBe('https://api.example.com');
    });

    it('should accept model in config', () => {
      const config = { model: 'sd-xl' };
      const provider = new ImageProvider(config);
      expect(provider.config.model).toBe('sd-xl');
    });

    it('should accept timeout in config', () => {
      const config = { timeout: 30000 };
      const provider = new ImageProvider(config);
      expect(provider.config.timeout).toBe(30000);
    });

    it('should accept all standard config fields together', () => {
      const config = {
        apiKey: 'my-key',
        baseUrl: 'https://api.example.com',
        model: 'sd-xl',
        timeout: 60000
      };
      const provider = new ImageProvider(config);
      expect(provider.config).toEqual(config);
    });

    it('should preserve additional config fields', () => {
      const config = {
        apiKey: 'my-key',
        baseUrl: 'https://api.example.com',
        customField: 'custom-value',
        nested: { key: 'value' }
      };
      const provider = new ImageProvider(config);
      expect(provider.config.customField).toBe('custom-value');
      expect(provider.config.nested).toEqual({ key: 'value' });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when generate() is called on base class', async () => {
      const provider = new ImageProvider({ apiKey: 'test-key' });
      try {
        await provider.generate('test prompt');
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });

    it('should throw error when getModels() is called on base class', async () => {
      const provider = new ImageProvider({ apiKey: 'test-key' });
      try {
        await provider.getModels();
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('not implemented');
      }
    });

    it('should provide meaningful error messages', async () => {
      const provider = new ImageProvider({ apiKey: 'test-key' });
      try {
        await provider.generate('test');
      } catch (error) {
        expect(error.message.length).toBeGreaterThan(10);
        expect(error.message.toLowerCase()).toContain('generate');
      }
    });
  });

  describe('Static Properties', () => {
    it('should have providerName static property', () => {
      expect(ImageProvider.providerName).toBeDefined();
      expect(typeof ImageProvider.providerName).toBe('string');
    });

    it('should have providerType static property', () => {
      expect(ImageProvider.providerType).toBeDefined();
      expect(typeof ImageProvider.providerType).toBe('string');
    });

    it('should have requiredConfigFields static property', () => {
      expect(ImageProvider.requiredConfigFields).toBeDefined();
      expect(Array.isArray(ImageProvider.requiredConfigFields)).toBe(true);
    });

    it('should list apiKey and baseUrl as required fields', () => {
      const required = ImageProvider.requiredConfigFields;
      expect(required).toContain('apiKey');
      expect(required).toContain('baseUrl');
    });
  });

  describe('Inheritance', () => {
    it('should be extensible', () => {
      class TestProvider extends ImageProvider {}
      const provider = new TestProvider({ apiKey: 'test' });
      expect(provider).toBeInstanceOf(ImageProvider);
      expect(provider).toBeInstanceOf(TestProvider);
    });

    it('should allow overriding generate() method', async () => {
      class TestProvider extends ImageProvider {
        async generate(prompt) {
          return { imageUrl: 'http://test.com/image.png', metadata: { prompt } };
        }
      }
      const provider = new TestProvider({ apiKey: 'test' });
      const result = await provider.generate('test prompt');
      expect(result.imageUrl).toBe('http://test.com/image.png');
    });

    it('should allow overriding getModels() method', async () => {
      class TestProvider extends ImageProvider {
        async getModels() {
          return [{ id: 'model1', name: 'Model 1' }];
        }
      }
      const provider = new TestProvider({ apiKey: 'test' });
      const models = await provider.getModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('model1');
    });
  });
});
