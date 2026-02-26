import * as fs from 'fs';
import * as cp from 'child_process';

const PB_HOME = '/Applications/PureBasic.app/Contents/Resources';
const COMPILER = `${PB_HOME}/compilers/pbcompiler`;

const TEST_PROG = `Debug "Hello"
End
`;

async function main() {
  // Create test file
  const src = '/tmp/test_simple.pb';
  const exe = '/tmp/test_simple';
  fs.writeFileSync(src, TEST_PROG);
  
  // Compile
  cp.execSync(`"${COMPILER}" "${src}" --debugger --console --linenumbering --output "${exe}"`, {
    env: { ...process.env, PUREBASIC_HOME: PB_HOME }
  });
  
  // Create FIFOs
  const fifoIn = '/tmp/pb_test_in';
  const fifoOut = '/tmp/pb_test_out';
  try { fs.unlinkSync(fifoIn); } catch {}
  try { fs.unlinkSync(fifoOut); } catch {}
  cp.execSync(`mkfifo "${fifoIn}" && mkfifo "${fifoOut}"`);
  
  console.log('Launching program...');
  const prog = cp.spawn(exe, [], {
    env: {
      ...process.env,
      PUREBASIC_HOME: PB_HOME,
      PB_DEBUGGER_Communication: `FifoFiles;${fifoIn};${fifoOut}`,
      PB_DEBUGGER_Options: '1;1;0;0',
    }
  });
  
  let stderr = '';
  prog.stderr?.on('data', d => { stderr += d; });
  prog.on('exit', (c, s) => console.log(`Exit: code=${c}, signal=${s}`));
  
  await new Promise(r => setTimeout(r, 300));
  
  console.log('Opening FIFOs...');
  function openWithRetry(path: string, flags: number, maxRetries = 30): number {
    for (let i = 0; i < maxRetries; i++) {
      try { return fs.openSync(path, flags); } 
      catch (e: any) {
        if (e.code === 'ENXIO') { require('child_process').execSync('sleep 0.1'); continue; }
        throw e;
      }
    }
    throw new Error(`Failed to open ${path}`);
  }
  
  const fdIn = openWithRetry(fifoIn, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const fdOut = openWithRetry(fifoOut, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
  console.log('FIFOs opened');

  function readMsg() {
    const hdr = Buffer.alloc(20);
    let n = fs.readSync(fdIn, hdr, 0, 20, null);
    if (n !== 20) throw new Error('Short read');
    const dataLen = hdr.readUInt32LE(4);
    if (dataLen > 0) {
      const data = Buffer.alloc(dataLen);
      fs.readSync(fdIn, data, 0, dataLen, null);
    }
    return { cmd: hdr.readUInt32LE(0), v1: hdr.readUInt32LE(8), v2: hdr.readUInt32LE(12) };
  }
  
  function readWithRetry() {
    for (let i = 0; i < 100; i++) {
      try { return readMsg(); } 
      catch (e: any) { 
        if (e.code === 'EAGAIN') { require('child_process').execSync('sleep 0.05'); continue; }
        throw e;
      }
    }
    throw new Error('Read timeout');
  }
  
  console.log('Reading Init...');
  const init = readWithRetry();
  console.log(`  Init: cmd=${init.cmd}, v2=${init.v2}`);
  
  console.log('Reading ExeMode...');
  const exeMode = readWithRetry();
  console.log(`  ExeMode: v1=${exeMode.v1}`);

  console.log('Sending Run...');
  const run = Buffer.alloc(20);
  run.writeUInt32LE(2, 0);
  fs.writeSync(fdOut, run);
  console.log('  Run sent');
  
  console.log('Listening for 3 seconds...');
  const responses: any[] = [];
  const start = Date.now();
  
  while (Date.now() - start < 3000) {
    try {
      const buf = Buffer.alloc(20);
      const n = fs.readSync(fdIn, buf, 0, 20, null);
      if (n === 20) {
        const cmd = buf.readUInt32LE(0);
        const dataSize = buf.readUInt32LE(4);
        console.log(`  Got: cmd=${cmd}`);
        if (dataSize > 0) {
          const data = Buffer.alloc(dataSize);
          fs.readSync(fdIn, data, 0, dataSize, null);
        }
        responses.push(cmd);
      }
    } catch (e: any) {
      if (e.code !== 'EAGAIN') console.log('  Error:', e.message);
    }
    require('child_process').execSync('sleep 0.05');
  }
  
  console.log(`\nTotal responses: ${responses.length}`);
  console.log('Stderr:', stderr || '(empty)');
  
  prog.kill();
  fs.closeSync(fdIn); fs.closeSync(fdOut);
  try { fs.unlinkSync(fifoIn); } catch {}
  try { fs.unlinkSync(fifoOut); } catch {}

  try { fs.unlinkSync(src); } catch {}
  try { fs.unlinkSync(exe); } catch {}
}

main().catch(console.error);
