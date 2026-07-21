import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const stylesheet = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

function themeBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`Missing CSS block for ${selector}.`);
  return match[1];
}

function color(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match?.[1]) throw new Error(`Missing hexadecimal --${name} token.`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red = 0, green = 0, blue = 0] = channels.map(channel => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function expectAccessibleTokens(selector: string): void {
  const block = themeBlock(selector);
  expect(contrast(color(block, 'subtle'), color(block, 'panel'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(block, 'subtle'), color(block, 'bg'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(block, 'danger'), color(block, 'danger-soft'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(block, 'action'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(block, 'action-hover'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(block, 'control-border'), color(block, 'panel'))).toBeGreaterThanOrEqual(3);
  expect(contrast(color(block, 'focus-ring'), color(block, 'panel'))).toBeGreaterThanOrEqual(3);
}

describe('application design tokens', () => {
  test('meet WCAG contrast thresholds in both themes', () => {
    expectAccessibleTokens(':root');
    expectAccessibleTokens("html[data-theme='dark']");
  });

  test('apply the accessible boundary token to form controls', () => {
    expect(stylesheet).toMatch(
      /\.input,\s*\.select,\s*\.textarea\s*\{[^}]*border:\s*1px solid var\(--control-border\)/
    );
  });
});
