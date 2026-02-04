import {
  generateRandomNameSuffix,
  generateDefaultResourceName,
  validateResourceName,
} from '../../../../src/util/integration/generate-resource-name';

describe('generateRandomNameSuffix', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns format color-noun', () => {
    const suffix = generateRandomNameSuffix();
    expect(suffix).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it('returns first color and noun when random is 0', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateRandomNameSuffix()).toBe('gray-apple');
  });

  it('returns last color and noun when random approaches 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(generateRandomNameSuffix()).toBe('sky-grass');
  });

  it('has uniform distribution (edge elements are not biased)', () => {
    // With Math.floor(arr.length * Math.random()), all indices have equal probability
    // Test that index 0 is reachable with random = 0
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const result1 = generateRandomNameSuffix();
    expect(result1).toBe('gray-apple');

    // Test that last index is reachable with random just under 1
    jest.spyOn(Math, 'random').mockReturnValue(0.9999);
    const result2 = generateRandomNameSuffix();
    expect(result2).toBe('sky-grass');
  });
});

describe('generateDefaultResourceName', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefixes with product slug', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('neon')).toBe('neon-gray-apple');
  });

  it('works with different product slugs', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateDefaultResourceName('upstash-redis')).toBe(
      'upstash-redis-gray-apple'
    );
  });

  it('produces valid resource name format', () => {
    const name = generateDefaultResourceName('test-product');
    // Should be: productSlug-color-noun, all lowercase with hyphens
    expect(name).toMatch(/^[a-z0-9-]+-[a-z]+-[a-z]+$/);
  });
});

describe('validateResourceName', () => {
  it('returns undefined for valid names', () => {
    expect(validateResourceName('my-resource')).toBeUndefined();
    expect(validateResourceName('neon-gray-apple')).toBeUndefined();
    expect(validateResourceName('test123')).toBeUndefined();
    expect(validateResourceName('a')).toBeUndefined();
  });

  it('rejects empty names', () => {
    expect(validateResourceName('')).toBe('Resource name cannot be empty');
    expect(validateResourceName('   ')).toBe('Resource name cannot be empty');
  });

  it('rejects names over 64 characters', () => {
    const longName = 'a'.repeat(65);
    expect(validateResourceName(longName)).toBe(
      'Resource name cannot exceed 64 characters'
    );

    // 64 chars should be fine
    const exactlyMaxName = 'a'.repeat(64);
    expect(validateResourceName(exactlyMaxName)).toBeUndefined();
  });

  it('rejects names with invalid characters', () => {
    expect(validateResourceName('My-Resource')).toBe(
      'Resource name can only contain lowercase letters, numbers, and hyphens'
    );
    expect(validateResourceName('my_resource')).toBe(
      'Resource name can only contain lowercase letters, numbers, and hyphens'
    );
    expect(validateResourceName('my resource')).toBe(
      'Resource name can only contain lowercase letters, numbers, and hyphens'
    );
    expect(validateResourceName('my.resource')).toBe(
      'Resource name can only contain lowercase letters, numbers, and hyphens'
    );
  });
});
