import { expect as bunExpect } from 'bun:test';

const originalExpect = bunExpect;
let mockId = 0;

function createMockFn(impl) {
    const id = ++mockId;
    const calls = [];
    const results = [];

    const mockFn = function mockFn(...args) {
        calls.push(args);
        const result = { type: 'return', value: undefined };

        if (mockFn._mockImplementation) {
            try {
                result.value = mockFn._mockImplementation.apply(this, args);
            } catch (error) {
                result.type = 'throw';
                result.value = error;
                throw error;
            }
        } else if (impl) {
            try {
                result.value = impl.apply(this, args);
            } catch (error) {
                result.type = 'throw';
                result.value = error;
                throw error;
            }
        }

        results.push(result);
        return result.value;
    };

    mockFn._isMockFunction = true;
    mockFn._mockId = id;
    mockFn._mockCalls = calls;
    mockFn._mockResults = results;
    mockFn._mockImplementation = impl || null;

    mockFn.mock = {
        get calls() { return [...calls]; },
        get results() { return [...results]; },
        reset() {
            calls.length = 0;
            results.length = 0;
        }
    };

    mockFn.mockImplementation = function(fn) {
        mockFn._mockImplementation = fn;
        return mockFn;
    };

    mockFn.mockReturnValue = function(value) {
        mockFn._mockImplementation = () => value;
        return mockFn;
    };

    mockFn.mockResolvedValue = function(value) {
        mockFn._mockImplementation = () => Promise.resolve(value);
        return mockFn;
    };

    mockFn.mockRejectedValue = function(error) {
        mockFn._mockImplementation = () => Promise.reject(error);
        return mockFn;
    };

    return mockFn;
}

// Match helper for asymmetric matchers
function matchesAsymmetric(expected, actual) {
    if (expected && typeof expected === 'object' && expected.$$typeof === Symbol.for('jest.asymmetricMatcher')) {
        return expected.asymmetricMatch(actual);
    }
    if (typeof expected === 'object' && expected !== null && actual !== null) {
        if (Array.isArray(expected)) {
            if (!Array.isArray(actual) || expected.length !== actual.length) return false;
            return expected.every((exp, i) => matchesAsymmetric(exp, actual[i]));
        }
        for (const key of Object.keys(expected)) {
            if (!(key in actual)) return false;
            if (!matchesAsymmetric(expected[key], actual[key])) return false;
        }
        return true;
    }
    return JSON.stringify(expected) === JSON.stringify(actual);
}

// Create asymmetric matchers
globalThis.expect = Object.assign((value) => {
    const matchers = originalExpect(value);

    matchers.toHaveBeenCalledWith = function(...expectedArgs) {
        if (!value || !value._isMockFunction) {
            throw new Error('Expected a mock function');
        }
        const wasCalled = value._mockCalls.some(call =>
            matchesAsymmetric(expectedArgs, call)
        );
        if (!wasCalled) {
            throw new Error(
                `Expected mock to have been called with ${JSON.stringify(expectedArgs)}\n` +
                `Received calls: ${JSON.stringify(value._mockCalls)}`
            );
        }
    };

    matchers.toHaveBeenCalled = function() {
        if (!value || !value._isMockFunction) {
            throw new Error('Expected a mock function');
        }
        if (value._mockCalls.length === 0) {
            throw new Error('Expected mock to have been called, but it was not called');
        }
    };

    matchers.toHaveBeenCalledTimes = function(times) {
        if (!value || !value._isMockFunction) {
            throw new Error('Expected a mock function');
        }
        if (value._mockCalls.length !== times) {
            throw new Error(
                `Expected mock to have been called ${times} times, but it was called ${value._mockCalls.length} times`
            );
        }
    };

    return matchers;
}, {
    objectContaining: (expected) => ({
        $$typeof: Symbol.for('jest.asymmetricMatcher'),
        asymmetricMatch: (actual) => {
            for (const key of Object.keys(expected)) {
                if (!(key in actual)) return false;
                if (!matchesAsymmetric(expected[key], actual[key])) return false;
            }
            return true;
        }
    }),
    any: (expectedClass) => ({
        $$typeof: Symbol.for('jest.asymmetricMatcher'),
        asymmetricMatch: (actual) => {
            if (expectedClass === Blob) return actual instanceof Blob;
            if (expectedClass === String) return typeof actual === 'string';
            if (expectedClass === Number) return typeof actual === 'number';
            if (expectedClass === Boolean) return typeof actual === 'boolean';
            if (expectedClass === Object) return typeof actual === 'object' && actual !== null;
            return actual instanceof expectedClass;
        }
    })
});

Object.keys(originalExpect).forEach(key => {
    if (typeof originalExpect[key] !== 'undefined') {
        globalThis.expect[key] = originalExpect[key];
    }
});

globalThis.jest = {
    fn: (impl) => createMockFn(impl),
    mock: () => {},
    clearAllMocks: () => {}
};
