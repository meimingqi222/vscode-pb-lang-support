'use strict';
/**
 * Simplified probe: connect, receive Init + entry-stop, then send Run without
 * any breakpoints. Observe all events to decode the full command sequence.
 */
const net    = require('net');
const cp     = require('child_process');
const crypto = require('crypto');

const path = require('path');
const HEADER_SIZE = 20;
const EXE_PATH = process.argv[2] || path.resolve(process.cwd(), 'test/samples/debug/test_debug.exe');

function parseHeader(buf) {
  if (buf.length < HEADER_SIZE) return null;
  return {
    command:   buf.readUInt32LE(0),
    dataSize:  buf.readUInt32LE(4),
    value1:    buf.readUInt32LE(8),
    value2:    buf.readUInt32LE(12),
  };
}
function buildFrame(command, v1, v2) {
  const buf = Buffer.alloc(HEADER_SIZE);
  buf.writeUInt32LE(command, 0); buf.writeUInt32LE(0, 4);
  buf.writeUInt32LE(v1, 8); buf.writeUInt32LE(v2, 12);
  buf.writeUInt32LE(0, 16);
  return buf;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const id = crypto.randomBytes(4).toString('hex').toUpperCase();
  const pipeA = `\\\\.\\pipe\\PureBasic_DebuggerPipeA_${id}`;
  const pipeB = `\\\\.\\pipe\\PureBasic_DebuggerPipeB_${id}`;
  const commString = `NamedPipes;${pipeA};${pipeB}`;
  console.log('Pipe ID:', id);

  let sockB = null;
  let connA = false, connB = false;
  const recvBuf = [];
  const msgs = [];
  const srvA = net.createServer();
  const srvB = net.createServer();

  const ready = new Promise(res => {
    function check() { if (connA && connB) res(); }
    srvA.listen(pipeA, () => {
      srvA.once('connection', sock => {
        connA = true;
        sock.on('data', chunk => {
          recvBuf.push(chunk);
          const total = Buffer.concat(recvBuf);
          let off = 0;
          while (off + HEADER_SIZE <= total.length) {
            const h = parseHeader(total.slice(off));
            const end = off + HEADER_SIZE + h.dataSize;
            if (total.length < end) break;
            const data = total.slice(off + HEADER_SIZE, end);
            msgs.push({ ...h, data });
            let info = `  cmd=${h.command} v1=${h.value1} v2=${h.value2} v2_hi=${h.value2 >> 16} v2_lo=${h.value2 & 0xFFFF} dsz=${h.dataSize}`;
            if (data.length > 0) {
              const s = data.toString('utf8').replace(/\x00/g, '|');
              info += `\n    data_utf8: "${s.substring(0, 120)}"`;
            }
            console.log(`[t=${Date.now() % 100000}]${info}`);
            off = end;
          }
        });
        sock.on('end', () => console.log('[PipeA ended]'));
        check();
      });
    });
    srvB.listen(pipeB, () => {
      srvB.once('connection', sock => { sockB = sock; connB = true; check(); });
    });
  });

  const proc = cp.spawn(EXE_PATH, [], {
    env: { ...process.env, PB_DEBUGGER_Communication: commString, PB_DEBUGGER_Options: '1;1;0;0' },
    stdio: 'ignore'
  });
  proc.on('exit', code => console.log('[exit code]', code));

  await Promise.race([ready, sleep(5000).then(() => { throw new Error('connect timeout'); })]);
  console.log('[connected]\n');

  // Wait 1.5s for Init + entry-stop
  await sleep(1500);
  console.log(`\n--- Messages after entry: ${msgs.length} ---`);

  // Just send Run, NO breakpoints
  console.log('Sending Run (cmd=2)...');
  sockB.write(buildFrame(2, 0, 0));

  // Wait 3s to observe all events from program running to end
  await sleep(3000);

  console.log(`\n=== TOTAL MESSAGES: ${msgs.length} ===`);
  msgs.forEach((m, i) => {
    let extra = '';
    if (m.data.length > 0) {
      extra = `  utf8:"${m.data.toString('utf8').replace(/\x00/g, '|').substring(0, 80)}"`;
    }
    console.log(`  [${i}] cmd=${m.command} v1=${m.value1} v2=${m.value2} (v2hi=${m.value2>>16} v2lo=${m.value2&0xFFFF}) dsz=${m.dataSize}${extra}`);
  });

  proc.kill();
  srvA.close();
  srvB.close();
}

run().catch(e => { console.error('[fatal]', e.message); process.exit(1); });
