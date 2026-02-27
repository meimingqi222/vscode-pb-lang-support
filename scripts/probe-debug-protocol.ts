/**
 * Protocol probe script.
 *
 * Run with: node -r ts-node/register scripts/probe-debug-protocol.ts
 * Or compile first: npx tsc --module commonjs --target ES2020 --outDir out-probe scripts/probe-debug-protocol.ts
 *
 * What it does:
 *  1. Generates a random pipe ID
 *  2. Creates both named pipe servers (PipeA = debugger→PB, PipeB = PB→debugger)
 *  3. Launches the pre-compiled test_debug.exe with the pipe ID in the env
 *  4. Dumps every byte received on PipeB in hex + decoded CommandInfo if header is complete
 *  5. After receiving the first message, tries to send various commands to see the response
 */
'use strict';
const net    = require('net');
const cp     = require('child_process');
const crypto = require('crypto');

const path = require('path');
const HEADER_SIZE = 20;
const EXE_PATH = process.argv[2] || path.resolve(process.cwd(), 'test/samples/debug/test_debug.exe');

function hexDump(buf: Buffer, label: string) {
  const hex  = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(buf).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
  console.log(`[${label}] ${hex}  |${ascii}|`);
}

function parseHeader(buf: Buffer) {
  if (buf.length < HEADER_SIZE) return null;
  return {
    command:   buf.readUInt32LE(0),
    dataSize:  buf.readUInt32LE(4),
    value1:    buf.readUInt32LE(8),
    value2:    buf.readUInt32LE(12),
    timestamp: buf.readUInt32LE(16),
  };
}

function buildFrame(command: number, value1 = 0, value2 = 0, data?: Buffer): Buffer {
  const d   = data ?? Buffer.alloc(0);
  const buf = Buffer.alloc(HEADER_SIZE + d.length);
  buf.writeUInt32LE(command,    0);
  buf.writeUInt32LE(d.length,   4);
  buf.writeUInt32LE(value1,     8);
  buf.writeUInt32LE(value2,    12);
  buf.writeUInt32LE(0,         16);
  d.copy(buf, HEADER_SIZE);
  return buf;
}

async function main() {
  const pipeId   = crypto.randomBytes(4).toString('hex').toUpperCase();
  const pipeNameA = `\\\\.\\pipe\\PureBasic_DebuggerPipeA_${pipeId}`;
  const pipeNameB = `\\\\.\\pipe\\PureBasic_DebuggerPipeB_${pipeId}`;

  console.log(`\n=== PureBasic Debug Protocol Probe ===`);
  console.log(`Pipe ID : ${pipeId}`);
  console.log(`PipeA   : ${pipeNameA}  (debugger→program)`);
  console.log(`PipeB   : ${pipeNameB}  (program→debugger)\n`);

  let socketA: any = null;
  let socketB: any = null;
  let connectedA = false;
  let connectedB = false;

  const serverA = net.createServer();
  const serverB = net.createServer();

  // Accumulate raw bytes from PipeB
  const recvBuf: Buffer[] = [];

  function checkConnected() {
    if (connectedA && connectedB) {
      console.log('[CONNECTED] Both pipes connected.\n');
      onBothConnected();
    }
  }

  // ─── PipeA: commands debugger→program ─────────────────────────────────
  serverA.listen(pipeNameA, () => {
    console.log(`[PipeA] Listening...`);
    serverA.once('connection', (sock: any) => {
      socketA = sock;
      connectedA = true;
      console.log(`[PipeA] Program connected (write socket ready)`);
      sock.on('error', (e: any) => console.error('[PipeA error]', e.message));
      checkConnected();
    });
  });

  // ─── PipeB: events program→debugger ───────────────────────────────────
  serverB.listen(pipeNameB, () => {
    console.log(`[PipeB] Listening...`);
    serverB.once('connection', (sock: any) => {
      socketB = sock;
      connectedB = true;
      console.log(`[PipeB] Program connected (read socket ready)`);

      sock.on('data', (chunk: Buffer) => {
        console.log(`\n[PipeB ← rx] ${chunk.length} bytes`);
        hexDump(chunk, 'raw');
        recvBuf.push(chunk);

        // Try to parse as CommandInfo header
        const total = Buffer.concat(recvBuf);
        if (total.length >= HEADER_SIZE) {
          const h = parseHeader(total);
          console.log('[parsed header]', JSON.stringify(h));
          if (h && total.length >= HEADER_SIZE + h.dataSize) {
            const data = total.slice(HEADER_SIZE, HEADER_SIZE + h.dataSize);
            if (data.length > 0) {
              console.log('[data hex]', Array.from(data).map((b: number) => b.toString(16).padStart(2,'0')).join(' '));
              // Try decoding as UTF-16LE
              try { console.log('[data utf16le]', data.toString('utf16le')); } catch {}
              // Try decoding as UTF-8
              try { console.log('[data utf8]', data.toString('utf8')); } catch {}
            }
          }
        }
      });

      sock.on('error', (e: any) => console.error('[PipeB error]', e.message));
      sock.on('end',   () => console.log('[PipeB] Socket ended'));
      checkConnected();
    });
  });

  // ─── Launch the program ────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 200)); // let pipes start listening

  console.log(`\n[Launch] ${EXE_PATH}`);
  const proc = cp.spawn(EXE_PATH, [], {
    env: { ...process.env, PB_DEBUGGER_Communication: pipeId },
    stdio: 'ignore',
    detached: false,
  });
  proc.on('error', (e: any) => console.error('[Launch error]', e.message));
  proc.on('exit',  (code: number) => console.log(`\n[Program exited] code=${code}`));

  // ─── After both connected, probe the protocol ──────────────────────────
  async function onBothConnected() {
    const send = (cmd: number, v1 = 0, v2 = 0, data?: Buffer) => {
      const frame = buildFrame(cmd, v1, v2, data);
      console.log(`\n[PipeA → tx] cmd=${cmd} v1=${v1} v2=${v2} data=${data?.length ?? 0}B`);
      hexDump(frame, 'tx');
      socketA.write(frame);
    };

    // Wait 1s to see if program sends something first
    console.log('\n[Probe] Waiting 1s to see if program sends first...');
    await new Promise(r => setTimeout(r, 1000));

    if (recvBuf.length === 0) {
      console.log('[Probe] Nothing received. Program is waiting for debugger to initiate.\n');

      // Try: send Run (cmd=2) – maybe program needs "go" signal
      console.log('[Probe] Sending Run (cmd=2)...');
      send(2);
      await new Promise(r => setTimeout(r, 1000));

      if (recvBuf.length === 0) {
        // Try: send Stop (cmd=0)
        console.log('[Probe] Still nothing. Sending Stop (cmd=0)...');
        send(0);
        await new Promise(r => setTimeout(r, 1000));
      }

      if (recvBuf.length === 0) {
        // Try: echo a version message (like the IDE would) – cmd=100 or cmd=12 with value1=12
        for (const testCmd of [100, 12, 255, 1000]) {
          console.log(`[Probe] Trying cmd=${testCmd} with value1=12 (version)...`);
          send(testCmd, 12);
          await new Promise(r => setTimeout(r, 500));
          if (recvBuf.length > 0) {
            console.log(`[Probe] Got response to cmd=${testCmd}!`);
            break;
          }
        }
      }
    } else {
      console.log('[Probe] Program sent first! Now echoing back...');
      // Echo back the same command with value1=12
      const total = Buffer.concat(recvBuf);
      const h = parseHeader(total);
      if (h) {
        send(h.command, 12, 0);
        await new Promise(r => setTimeout(r, 1000));
      }

      // Now try to send a breakpoint at line 10
      console.log('[Probe] Setting breakpoint at line 10 of file 0...');
      const bp = (0 << 20) | 10;
      send(3, 1, bp); // BreakPoint Add

      // Then run
      await new Promise(r => setTimeout(r, 200));
      console.log('[Probe] Sending Run (cmd=2)...');
      send(2);
      await new Promise(r => setTimeout(r, 2000));
    }

    // Final wait
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n=== Probe complete ===');
    console.log(`Total bytes received on PipeB: ${recvBuf.reduce((s, b) => s + b.length, 0)}`);

    proc.kill();
    serverA.close();
    serverB.close();
    process.exit(0);
  }

  // Global timeout
  setTimeout(() => {
    console.log('\n[TIMEOUT] 20 seconds elapsed, exiting.');
    proc.kill();
    serverA.close();
    serverB.close();
    process.exit(1);
  }, 20_000);
}

main().catch(e => { console.error(e); process.exit(1); });
