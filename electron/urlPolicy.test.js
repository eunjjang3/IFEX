import { describe, expect, it } from 'vitest';
import { isAllowedAppNavigation, isAllowedExternalUrl } from './urlPolicy.js';

describe('desktop external URL policy', () => {
  it('allows only the explicit HTTPS service origins', () => {
    expect(isAllowedExternalUrl('https://www.openstreetmap.org/copyright')).toBe(true);
    expect(isAllowedExternalUrl('https://lens.google.com/')).toBe(true);
    expect(isAllowedExternalUrl('http://lens.google.com/')).toBe(false);
    expect(isAllowedExternalUrl('https://lens.google.com.evil.example/')).toBe(false);
    expect(isAllowedExternalUrl('https://user@lens.google.com/')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('desktop application navigation policy', () => {
  it('keeps development navigation on the renderer origin', () => {
    const applicationUrl = 'http://127.0.0.1:5173/';
    expect(isAllowedAppNavigation('http://127.0.0.1:5173/third-party-notices.txt', applicationUrl)).toBe(true);
    expect(isAllowedAppNavigation('http://localhost:5173/', applicationUrl)).toBe(false);
    expect(isAllowedAppNavigation('https://example.com/', applicationUrl)).toBe(false);
  });

  it('keeps packaged navigation inside the renderer directory', () => {
    const applicationUrl = 'file:///Applications/IFEX.app/Contents/Resources/app.asar/dist/index.html';
    expect(isAllowedAppNavigation('file:///Applications/IFEX.app/Contents/Resources/app.asar/dist/third-party-notices.txt', applicationUrl)).toBe(true);
    expect(isAllowedAppNavigation('file:///Applications/IFEX.app/Contents/Resources/app.asar/electron/main.js', applicationUrl)).toBe(false);
    expect(isAllowedAppNavigation('file:///Applications/IFEX.app/Contents/Resources/app.asar/dist/%2Fescape', applicationUrl)).toBe(false);
  });
});
