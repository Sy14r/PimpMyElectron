import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';

export class PipeCDP extends EventEmitter {
  pending = new Map();
  nextId = 0;
  closed = false;
  buffer = '';
  decoder = new StringDecoder('utf8');
  constructor(input, output, timeout = 10000) {
    super(); this.input = input; this.timeout = timeout;
    output.on('data', chunk => this.consume(chunk));
    output.on('end', () => this.close());
    output.on('error', () => this.close());
    input.on('error', () => this.close());
  }
  consume(chunk) {
    this.buffer += this.decoder.write(chunk);
    if (this.buffer.length > 32 * 1024 * 1024) return this.close();
    let end;
    while ((end = this.buffer.indexOf('\0')) >= 0) {
      const packet = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!packet) continue;
      let message;
      try { message = JSON.parse(packet); } catch { this.close(); return; }
      if (message.id) {
        const p = this.pending.get(message.id);
        if (!p) continue;
        clearTimeout(p.timer); this.pending.delete(message.id);
        if (message.error) p.reject(new Error(`${p.method}: ${message.error.message}`));
        else p.resolve(message.result);
      } else this.emit('event', message);
    }
  }
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('CDP pipe closed'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, this.timeout);
      this.pending.set(id, { method, resolve, reject, timer });
      this.input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  async evaluate(expression, sessionId) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP pipe closed')); }
    this.pending.clear(); this.emit('closed');
  }
}
