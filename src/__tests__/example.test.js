/**
 * Example test file to verify Bun test infrastructure works
 * This is Task 0: Set Up Test Infrastructure
 */

import { describe, it, expect } from 'bun:test';

describe('Bun Test Infrastructure', () => {
  it('should run a simple test', () => {
    expect(true).toBe(true);
  });

  it('should perform basic arithmetic', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('async test');
    const value = await promise;
    expect(value).toBe('async test');
  });

  it('should assert array contents', () => {
    const array = [1, 2, 3];
    expect(array).toHaveLength(3);
    expect(array).toContain(2);
  });
});
