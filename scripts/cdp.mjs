import { EventEmitter } from 'node:events';

// Deliberately accepts loopback endpoints only. CDP grants control of the page.
export function loopbackURL(value, protocols = ['http:', 'ws:']) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new Error('Expected an unauthenticated 127.0.0.1 CDP URL');
  }
  return url;
}

export async function targets(port) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid port');
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`CDP discovery: ${response.status}`);
  return response.json();
}

export class CDP extends EventEmitter {
  pending = new Map();
  nextId = 0;
  static async connect(url) {
    loopbackURL(url, ['ws:']);
    const client = new CDP();
    client.socket = new WebSocket(url);
    client.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = client.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        client.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else client.emit(message.method, message.params);
    });
    client.socket.addEventListener('close', () => {
      for (const pending of client.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('CDP connection closed'));
      }
      client.pending.clear();
      client.emit('disconnected');
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.socket.close(); reject(new Error('CDP connect timeout')); }, 5000);
      client.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      client.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return client;
  }
  send(method, params = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP is not connected'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

export async function eventually(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const result = await fn(); if (result) return result; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Timed out waiting for condition');
}
