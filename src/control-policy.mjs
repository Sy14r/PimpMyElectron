const everyday = new Set(['status', 'reload', 'restart-shell', 'stop', 'show']);
const development = new Set(['inspect', 'screenshot', 'test-network-offline', 'test-network-restore']);
export function createControlPolicy(args = []) {
  if (args.some(arg => arg !== '--development') || args.length > 1) throw Error('Usage: node scripts/dev.mjs [--development]');
  const mode = args.includes('--development') ? 'development' : 'everyday';
  return Object.freeze({mode, assert(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('Invalid control request');
    if (everyday.has(request.op)) return;
    if (development.has(request.op)) {
      if (mode === 'development') return;
      throw Error('Developer controls are disabled. Restart explicitly with npm run dev:debug in a test workspace.');
    }
    throw Error('Unknown operation');
  }});
}
