const COLORS = [
  'gray',
  'red',
  'rose',
  'yellow',
  'amber',
  'green',
  'lime',
  'emerald',
  'blue',
  'lightblue',
  'cyan',
  'purple',
  'violet',
  'fuchsia',
  'orange',
  'pink',
  'indigo',
  'teal',
  'sky',
];

const NOUNS = [
  'apple',
  'ball',
  'car',
  'dog',
  'elephant',
  'flower',
  'garden',
  'house',
  'island',
  'jacket',
  'kite',
  'lamp',
  'mountain',
  'notebook',
  'ocean',
  'park',
  'queen',
  'river',
  'school',
  'tree',
  'umbrella',
  'village',
  'window',
  'xylophone',
  'yacht',
  'zebra',
  'book',
  'chair',
  'door',
  'grass',
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(arr.length * Math.random())];
}

/**
 * Generates a random resource name suffix in the format `{color}-{noun}`.
 * Uses the same word lists as the web UI for consistency.
 */
export function generateRandomNameSuffix(): string {
  return `${randomElement(COLORS)}-${randomElement(NOUNS)}`;
}

/**
 * Generates a default resource name in the format `{productSlug}-{color}-{noun}`.
 * Matches the pattern used by the web checkout flow.
 */
export function generateDefaultResourceName(productSlug: string): string {
  return `${productSlug}-${generateRandomNameSuffix()}`;
}

/**
 * Validates a user-provided resource name.
 * Returns an error message if invalid, or undefined if valid.
 */
export function validateResourceName(name: string): string | undefined {
  if (!name || name.trim().length === 0) {
    return 'Resource name cannot be empty';
  }
  if (name.length > 64) {
    return 'Resource name cannot exceed 64 characters';
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return 'Resource name can only contain lowercase letters, numbers, and hyphens';
  }
  return undefined;
}
