'use strict';
/**
 * PureBasic Debug Protocol Probe (plain Node.js, no TypeScript needed)
 *
 * Protocol directions (from PureBasic IDE open-source code):
 *   PipeA = IDE "InPipe"  = program→debugger  (program WRITES, we READ)
 *   PipeB = IDE "OutPipe" = debugger→program  (we WRITE, program READS)
 *
 * PB_DEBUGGER_Communication format:
 *   "NamedPipes;\\.\pipe\PureBasic_DebuggerPipeA_XXXX;\\.\pipe\PureBasic_DebuggerPipeB_XXXX"
 *
 * Run: node scripts/probe-debug-protocol.js
 */
const net    = require('net');
const cp     = require('child_process');
const nodeCrypto = require('crypto');

const path = require('path');
const HEADER_SIZE = 20;
const EXE_PATH = process.argv[2] || path.resolve(process.cwd(), 'test/samples/debug/test_debug.exe');

function hexDump(buf, label) {
  const hex   = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(buf).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
  console.log(`  [${label}] ${hex}  |${ascii}|`);
}

function parseHeader(buf) {
  if (buf.length < HEADER_SIZE) return null;
  return {
    command:   buf.readUInt32LE(0),
    dataSize:  buf.readUInt32LE(4),
    value1:    buf.readUInt32LE(8),
    value2:    buf.readUInt32LE(12),
    timestamp: buf.readUInt32LE(16),
  };
}

function buildFrame(command, value1 = 0, value2 = 0, data = null) {
  const d   = data ?? Buffer.alloc(0);
  const buf = Buffer.alloc(HEADER_SIZE + d.length);
  buf.writeUInt32LE(command,  0);
  buf.writeUInt32LE(d.length, 4);
  buf.writeUInt32LE(value1,   8);
  buf.writeUInt32LE(value2,  12);
  buf.writeUInt32LE(0,       16);
  d.copy(buf, HEADER_SIZE);
  return buf;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pipeId    = nodeCrypto.randomBytes(4).toString('hex').toUpperCase();
  // PipeA: program→debugger (our InPipe — we READ)
  // PipeB: debugger→program (our OutPipe — we WRITE)
  const pipeNameA = `\\\\.\\pipe\\PureBasic_DebuggerPipeA_${pipeId}`;
  const pipeNameB = `\\\\.\\pipe\\PureBasic_DebuggerPipeB_${pipeId}`;
  const commString = `NamedPipes;${pipeNameA};${pipeNameB}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(` PureBasic Debug Protocol Probe`);
  console.log(`${'='.repeat(60)}`);
  console.log(` Pipe ID : ${pipeId}`);
  console.log(` PipeA   : ${pipeNameA}  (program→debugger, we READ)`);
  console.log(` PipeB   : ${pipeNameB}  (debugger→program, we WRITE)`);
  console.log(` CommStr : ${commString}`);
  console.log(`${'='.repeat(60)}\n`);

  let socketB    = null;  // our write socket (send commands to program)
  let connectedA = false;
  let connectedB = false;

  const recvBuf  = [];   // raw chunks from PipeA (program→debugger)
  const messages = [];   // parsed CommandInfo objects

  // serverA: program connects and WRITES events to us
  const serverA = net.createServer();
  // serverB: program connects and READS commands from us
  const serverB = net.createServer();

  const connectedPromise = new Promise(resolve => {
    function check() { if (connectedA && connectedB) resolve(); }

    serverA.listen(pipeNameA, () => {
      console.log('[PipeA] Listening (program→debugger, we read)');
      serverA.once('connection', sock => {
        connectedA = true;
        console.log('[PipeA] Program connected — reading events\n');
        sock.on('error', e => console.error('[PipeA error]', e.message));
        sock.on('end',   () => console.log('[PipeA] Socket ended'));
        sock.on('data', chunk => {
          console.log(`[PipeA ← rx] ${chunk.length} bytes`);
          hexDump(chunk, 'hex');
          recvBuf.push(chunk);

          // Accumulate and try to parse complete frames
          const total = Buffer.concat(recvBuf);
          let offset  = 0;
          while (offset + HEADER_SIZE <= total.length) {
            const h        = parseHeader(total.slice(offset));
            const frameEnd = offset + HEADER_SIZE + h.dataSize;
            if (total.length < frameEnd) break;

            const data = total.slice(offset + HEADER_SIZE, frameEnd);
            const msg  = { ...h, data };
            messages.push(msg);
            console.log(`  → cmd=${h.command} v1=${h.value1} v2=${h.value2} dataSize=${h.dataSize}`);

            if (data.length > 0) {
              // Try UTF-16LE (common for PB strings)
              try {
                const s = data.toString('utf16le').replace(/\x00/g, '');
                if (s.trim()) console.log(`  → data(utf16le): "${s}"`);
              } catch {}
              // Try UTF-8
              try {
                const s = data.toString('utf8').replace(/\x00/g, '');
                if (s.trim()) console.log(`  → data(utf8): "${s}"`);
              } catch {}
            }
            offset = frameEnd;
          }
          console.log('');
        });
        check();
      });
    });

    serverB.listen(pipeNameB, () => {
      console.log('[PipeB] Listening (debugger→program, we write)');
      serverB.once('connection', sock => {
        socketB    = sock;
        connectedB = true;
        console.log('[PipeB] Program connected — ready to send commands\n');
        sock.on('error', e => console.error('[PipeB error]', e.message));
        check();
      });
    });
  });

  // Launch the program
  console.log(`[Launch] ${EXE_PATH}`);
  console.log(`[Comm]   ${commString}\n`);
  const proc = cp.spawn(EXE_PATH, [], {
    env: {
      ...process.env,
      PB_DEBUGGER_Communication: commString,
      PB_DEBUGGER_Options: '1;1;0;0',  // unicode;stopOnStart;stopOnEnd;bigEndian
    },
    stdio: 'ignore',
    detached: false,
  });
  proc.on('error', e => console.error('[Launch error]', e.message));
  proc.on('exit',  code => console.log(`\n[Process exited] code=${code}`));

  // Wait for connection (max 10s)
  await Promise.race([
    connectedPromise,
    sleep(10_000).then(() => { throw new Error('Timeout waiting for connection'); }),
  ]);
  console.log('[Connected] Both pipes ready.\n');

  const send = (cmd, v1 = 0, v2 = 0, data = null) => {
    const frame = buildFrame(cmd, v1, v2, data);
    console.log(`[PipeB → tx] cmd=${cmd} v1=${v1} v2=${v2} data=${data?.length ?? 0}B`);
    hexDump(frame.slice(0, HEADER_SIZE), 'hdr');
    socketB.write(frame);
  };

  // ─── Phase 1: Did program send Init? ─────────────────────────────────────
  console.log('--- Phase 1: Waiting 2s to see Init from program ---');
  await sleep(2000);

  if (messages.length === 0) {
    console.log('[Info] Program sent nothing. Trying some commands...\n');

    // Try sending Stop (cmd=0) to see if program responds
    console.log('--- Phase 2: Sending Stop (cmd=0) ---');
    send(0);
    await sleep(1000);

    // Try Run (cmd=2)
    console.log('--- Phase 2b: Sending Run (cmd=2) ---');
    send(2);
    await sleep(1000);
  } else {
    console.log(`[Info] Program sent ${messages.length} message(s).\n`);
    const first = messages[0];
    console.log(`--- Phase 2: Init seen: cmd=${first.command} v1=${first.value1} v2=${first.value2} ---`);

    // ─── Phase 3: Set a breakpoint and run ───────────────────────────────────
    console.log('\n--- Phase 3: Set breakpoint at file=0 line=9, then Run ---');
    // BreakPoint Add: value1=1 (Add), value2=(fileNum<<16)|line
    send(3, 1, (0 << 20) | 8);  // BreakPoint Add: file=0, line0=8 (0-based; 1-based line 9)
    await sleep(200);
    send(2);   // Run
    await sleep(3000);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(' SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(` Messages received on PipeA: ${messages.length}`);
  messages.forEach((m, i) => {
    console.log(`  [${i}] cmd=${m.command} v1=${m.value1} v2=${m.value2} dataSize=${m.dataSize}`);
  });
  console.log(`${'='.repeat(60)}\n`);

  proc.kill();
  serverA.close();
  serverB.close();
}

main().catch(e => {
  console.error('\n[Fatal]', e.message);
  process.exit(1);
});
