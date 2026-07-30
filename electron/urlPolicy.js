import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_EXTERNAL_ORIGINS = new Set([
  'https://c2pa.org',
  'https://lens.google.com',
  'https://maps.apple.com',
  'https://tineye.com',
  'https://www.google.com',
  'https://www.openstreetmap.org',
]);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function isAllowedExternalUrl(value) {
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password) return false;
  return ALLOWED_EXTERNAL_ORIGINS.has(url.origin);
}

export function isAllowedAppNavigation(value, applicationUrl) {
  const target = parseUrl(value);
  const application = parseUrl(applicationUrl);
  if (!target || !application || target.username || target.password) return false;

  if (application.protocol === 'file:') {
    if (target.protocol !== 'file:') return false;
    try {
      const applicationDirectory = path.dirname(fileURLToPath(application));
      const targetPath = fileURLToPath(target);
      const relativePath = path.relative(applicationDirectory, targetPath);
      return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
    } catch {
      return false;
    }
  }

  return (application.protocol === 'http:' || application.protocol === 'https:')
    && target.origin === application.origin;
}
