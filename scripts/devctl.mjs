import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [op = 'status', file, targetId] = process.argv.slice(2);
const request = { op, ...(op === 'inspect' ? { expression: fs.readFileSync(file, 'utf8'), targetId } : {}) };
const socket = net.createConnection(path.join(root, '.lab/dev/control.sock'));
socket.setEncoding('utf8');
socket.setTimeout(15000, () => { console.error('Dev control timeout'); socket.destroy(); process.exitCode = 1; });
socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
let data = '';
socket.on('data', chunk => { data += chunk; });
socket.on('end', () => {
  const response = JSON.parse(data);
  if (!response.ok) { console.error(response.error); process.exitCode = 1; }
  else console.log(JSON.stringify(response.result, null, 2));
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
