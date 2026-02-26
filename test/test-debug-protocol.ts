/**
 * End-to-end test for PureBasic debugger protocol on macOS
 */
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';

const PB_HOME = '/Applications/PureBasic.app/Contents/Resources';
const COMPILER = path.join(PB_HOME, 'compilers/pbcompiler');

// Test program that waits for input
const TEST_PROGRAM = `; Test debug program
Debug "Line 1"
Debug "Line 2"
Debug "Line 3"
End
`;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createFifo(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    exec(`mkfifo "${name}"`, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function runTest(): Promise<void> {
  console.log('=== PureBasic Debugger Protocol Test ===\n');

  // Step 1: Create test source file
  const sourceFile = path.join(os.tmpdir(), 'test_debug.pb');
  const exeFile = path.join(os.tmpdir(), 'test_debug');
  
  fs.writeFileSync(sourceFile, TEST_PROGRAM);
  console.log(`1. Created test source: ${sourceFile}`);

  // Step 2: Compile with debugger
  console.log('2. Compiling with debugger...');
  const compileResult = cp.spawnSync(COMPILER, [
    sourceFile,
    '--debugger', '--console', '--linenumbering', '--output', exeFile
  ], {
    env: { ...process.env, PUREBASIC_HOME: PB_HOME }
  });

  if (compileResult.status !== 0) {
    console.error('Compilation failed:');
    console.error(compileResult.stderr?.toString());
    process.exit(1);
  }
  console.log('   Compilation successful');

  // Step 3: Create FIFOs
  const id = Date.now().toString(36);
  const inFifo = path.join(os.tmpdir(), `pb-test-in-${id}`);
  const outFifo = path.join(os.tmpdir(), `pb-test-out-${id}`);
  
  await createFifo(inFifo);
  await createFifo(outFifo);
  console.log(`3. Created FIFOs: in=${inFifo}, out=${outFifo}`);

  // Step 4: Launch program
  console.log('4. Launching program...');

  console.log('   Launching program process...');
  const env = {
    ...process.env,
    PUREBASIC_HOME: PB_HOME,
    PB_DEBUGGER_Communication: `FifoFiles;${inFifo};${outFifo}`,
    PB_DEBUGGER_Options: '1;1;0;0'
  };
  
  console.log('   Env PB_DEBUGGER_Communication:', env.PB_DEBUGGER_Communication);
  console.log('   Env PB_DEBUGGER_Options:', env.PB_DEBUGGER_Options);
  
  const program = cp.spawn(exeFile, [], { env });
  
  let stderr = '';
  let stdout = '';
  program.stderr?.on('data', (d) => { 
    stderr += d.toString(); 
    console.log('   [stderr]', d.toString().trim());
  });
  program.stdout?.on('data', (d) => { 
    stdout += d.toString(); 
    console.log('   [stdout]', d.toString().trim());
  });
  
  program.on('exit', (code, signal) => {
    console.log(`   Program exited: code=${code}, signal=${signal}`);
  });
  
  // Step 5: Connect to FIFOs
  console.log('5. Connecting to FIFOs...');
  await delay(500);

  // Helper to open FIFO with retry
  async function openFifoWithRetry(fifoPath: string, flags: number, maxRetries = 50): Promise<number> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return fs.openSync(fifoPath, flags);
      } catch (err: any) {
        if (err.code === 'ENXIO' || err.code === 'EAGAIN') {
          await delay(100);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to open ${fifoPath} after ${maxRetries} retries`);
  }

  // Open inFifo for reading (program writes here) - this should succeed first
  console.log('   Opening inFifo (read)...');
  const inFd = await openFifoWithRetry(inFifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  console.log('   inFifo opened');

  // Open outFifo for writing (program reads from here)
  console.log('   Opening outFifo (write)...');
  const outFd = await openFifoWithRetry(outFifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
  console.log('   outFifo opened');

  console.log('   FIFOs connected');

  const messages: any[] = [];
  let readBuffer = Buffer.alloc(0);
  const HEADER_SIZE = 20;

  const pumpMessages = (): void => {
    while (true) {
      const chunk = Buffer.alloc(4096);
      let bytesRead = 0;
      try {
        bytesRead = fs.readSync(inFd, chunk, 0, chunk.length, null);
      } catch (err: any) {
        if (err.code === 'EAGAIN') {
          break;
        }
        throw err;
      }

      if (bytesRead <= 0) {
        break;
      }

      readBuffer = Buffer.concat([readBuffer, chunk.slice(0, bytesRead)]);

      while (readBuffer.length >= HEADER_SIZE) {
        const dataSize = readBuffer.readUInt32LE(4);
        const totalSize = HEADER_SIZE + dataSize;
        if (readBuffer.length < totalSize) {
          break;
        }

        const msg = {
          command: readBuffer.readUInt32LE(0),
          dataSize,
          value1: readBuffer.readUInt32LE(8),
          value2: readBuffer.readUInt32LE(12),
          timestamp: readBuffer.readUInt32LE(16),
          data: readBuffer.slice(HEADER_SIZE, HEADER_SIZE + dataSize),
        };
        messages.push(msg);
        console.log(`   Received: cmd=${msg.command}, v1=${msg.value1}, v2=${msg.value2}, dataLen=${msg.data.length}`);

        readBuffer = readBuffer.slice(totalSize);
      }
    }
  };

  const waitForMessages = async (durationMs: number): Promise<void> => {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      pumpMessages();
      await delay(50);
    }
  };

  // Step 6: Receive Init and ExeMode
  console.log('6. Waiting for Init/ExeMode...');
  await waitForMessages(1000);

  // Check if we got Init (cmd=0) and ExeMode (cmd=2)
  const initMsg = messages.find((m) => m.command === 0);
  const exeModeMsg = messages.find((m) => m.command === 2);

  if (!initMsg) {
    console.error('   ERROR: No Init message received!');
    console.error('   Stderr:', stderr);
  } else {
    console.log('   Init received: version=' + initMsg.value2);
  }

  if (!exeModeMsg) {
    console.error('   ERROR: No ExeMode message received!');
  } else {
    console.log('   ExeMode received: flags=' + exeModeMsg.value1);
  }

  // Step 7: Send Run command
  if (initMsg && exeModeMsg) {
    console.log('7. Sending Run command...');

    // Serialize Run command (cmd=2)
    const runCmd = Buffer.alloc(20);
    runCmd.writeUInt32LE(2, 0); // command = Run
    runCmd.writeUInt32LE(0, 4); // dataSize = 0
    runCmd.writeUInt32LE(0, 8); // value1 = 0
    runCmd.writeUInt32LE(0, 12); // value2 = 0
    runCmd.writeUInt32LE(Math.floor(Date.now() / 1000), 16); // timestamp

    fs.writeSync(outFd, runCmd);
    console.log('   Run command sent');

    // Wait for program output
    await waitForMessages(1000);

    console.log('8. Checking for output...');
    console.log('   Messages received after Run:', messages.length);
    messages.slice(2).forEach((m, i) => {
      console.log(`   Message ${i + 3}: cmd=${m.command}`);
    });
  }

  // Cleanup
  console.log('\n9. Cleaning up...');
  program.kill();
  await delay(100);
  
  try { fs.closeSync(inFd); } catch {}
  try { fs.closeSync(outFd); } catch {}

  try { fs.unlinkSync(inFifo); } catch {}
  try { fs.unlinkSync(outFifo); } catch {}

  try { fs.unlinkSync(sourceFile); } catch {}
  try { fs.unlinkSync(exeFile); } catch {}
  
  console.log('   Cleanup complete');
  
  // Summary
  console.log('\n=== Test Summary ===');
  if (initMsg && exeModeMsg) {
    console.log('✓ Protocol handshake successful');
    if (messages.length > 2) {
      console.log('✓ Program responded to Run command');
    } else {
      console.log('✗ No response to Run command (program may have exited)');
    }
  } else {
    console.log('✗ Protocol handshake failed');
    console.log('Stderr output:');
    console.log(stderr || '(empty)');
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
