// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest';
import { renderIcons } from './icons';

describe('renderIcons', () => {
  beforeEach(() => {
    document.body.innerHTML = '<i class="nav-icon" data-lucide="house"></i>';
  });

  test('replaces registered placeholders with decorative inline SVGs', () => {
    renderIcons(document);

    const icon = document.querySelector<SVGElement>('svg.nav-icon');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('data-lucide')).toBe('house');
    expect(document.querySelector('i[data-lucide]')).toBeNull();
  });
});
