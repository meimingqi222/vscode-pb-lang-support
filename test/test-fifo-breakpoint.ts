/**
 * End-to-end test: verify FifoTransport polling fix.
 * Tests that breakpoints work on macOS using the actual FifoTransport class.
 *
 * Run: npx ts-node --project test/tsconfig.json test/test-fifo-breakpoint.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import { FifoTransport } from '../src/debug/transport/FifoTransport';

const PB_HOME = '/Applications/PureBasic.app/Contents/Resources';
const COMPILER = path.join(PB_HOME, 'compilers/pbcompiler');

const TEST_PROGRAM = `Debug "Line 1"
Debug "Line 2"
Debug "Line 3"
End
`;

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== FifoTransport Breakpoint E2E Test ===\n');

  const sourceFile = path.join(os.tmpdir(), `test_bp_${Date.now()}.pb`);
  const exeFile = sourceFile.replace('.pb', '');
  fs.writeFileSync(sourceFile, TEST_PROGRAM);
  console.log(`[1] Source: ${sourceFile}`);

  const comp = cp.spawnSync(COMPILER, [
    sourceFile, '--debugger', '--console', '--linenumbering', '--output', exeFile,
  ], { env: { ...process.env, PUREBASIC_HOME: PB_HOME } });
  if (comp.status !== 0) {
    console.error('Compilation FAILED:', comp.stderr?.toString());
    process.exit(1);
  }
  console.log('[2] Compiled OK');

  const transport = new FifoTransport();
  transport.on('log', (msg: string) => { /* silent */ });

  // Collect ALL messages into a queue for later inspection
  const allMessages: any[] = [];
  transport.on('message', (msg: any) => allMessages.push(msg));

  await transport.listen();
  const commStr = transport.getCommunicationString();
  console.log(`[3] Transport listening`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PUREBASIC_HOME: PB_HOME,
    PB_DEBUGGER_Communication: commStr,
    PB_DEBUGGER_Options: '1;1;0;0',
  };
  const prog = cp.spawn(exeFile, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let progExitInfo = '';
  prog.on('exit', (code, signal) => { progExitInfo = `code=${code}, signal=${signal}`; });

  console.log(`[4] Program launched (pid=${prog.pid})`);
  await delay(500);

  await transport.connect();
  console.log('[5] Transport connected');

  // Wait for Init + ExeMode to arrive
  await delay(1000);
  const initMsg = allMessages.find(m => m.command === 0);
  const exeMsg = allMessages.find(m => m.command === 2);
  if (!initMsg || !exeMsg) {
    console.error(`FAIL: Missing handshake messages (got ${allMessages.length} msgs)`);
    process.exit(1);
  }
  console.log(`[6] Init: version=${initMsg.value2}`);
  console.log(`[7] ExeMode: flags=${exeMsg.value1}`);

  // Set breakpoint at line 2 (0-based line 1)
  const packed = ((0 & 0xFFF) << 20) | (1 & 0xFFFFF);
  transport.send({ command: 3 /* BreakPoint */, value1: 1 /* Add */, value2: packed });
  console.log('[8] Breakpoint set at line 2');

  await delay(200);

  // Send Run
  allMessages.length = 0; // clear for fresh tracking
  transport.send({ command: 2 /* Run */ });
  console.log('[9] Run sent');

  // Helper: wait for a Stopped event (cmd=3) to appear in allMessages
  async function waitForStopped(label: string): Promise<any> {
    for (let i = 0; i < 50; i++) {
      await delay(100);
      const idx = allMessages.findIndex(m => m.command === 3);
      if (idx !== -1) return allMessages.splice(idx, 1)[0];
      if (progExitInfo) throw new Error(`Program exited before ${label}: ${progExitInfo}`);
    }
    throw new Error(`Timeout waiting for ${label}`);
  }

  const stop1 = await waitForStopped('first stop');
  const reason1 = stop1.value2;
  const line1v = (stop1.value1 & 0xFFFFF) + 1;
  console.log(`[10] Stopped: line=${line1v}, reason=${reason1}`);

  let testPassed = false;

  if (reason1 === 3) {
    console.log('    → Entry stop (CallDebuggerOnStart), sending Run...');
    transport.send({ command: 2 /* Run */ });

    const stop2 = await waitForStopped('breakpoint');
    const reason2 = stop2.value2;
    const line2 = (stop2.value1 & 0xFFFFF) + 1;
    console.log(`[11] Stopped: line=${line2}, reason=${reason2}`);

    if (reason2 === 7 && line2 === 2) {
      console.log('\n✓ BREAKPOINT HIT at line 2! Test PASSED.');
      testPassed = true;
    } else {
      console.log(`\n✗ Expected breakpoint at line 2 (reason=7), got line=${line2} reason=${reason2}`);
    }
    transport.send({ command: 2 /* Run */ });
  } else if (reason1 === 7) {
    const bpLine = (stop1.value1 & 0xFFFFF) + 1;
    console.log(`\n✓ BREAKPOINT HIT at line ${bpLine}! Test PASSED.`);
    testPassed = true;
    transport.send({ command: 2 /* Run */ });
  } else {
    console.log(`\n✗ Unexpected stop reason=${reason1}`);
  }

  await delay(500);
  console.log(`[12] Program exit: ${progExitInfo || '(still running)'}`);

  // Cleanup
  transport.close();
  try { prog.kill(); } catch {}
  try { fs.unlinkSync(sourceFile); } catch {}
  try { fs.unlinkSync(exeFile); } catch {}

  process.exit(testPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
