'use strict';
const fs = require('fs');
const cp = require('child_process');

const path = require('path');
const EXE = process.argv[2] || path.resolve(process.cwd(), 'test/samples/debug/test_debug.exe');

// List all named pipes
function listPipes() {
  try {
    return fs.readdirSync('\\\\.\\pipe').filter(p => /pure|debug|pb/i.test(p));
  } catch(e) {
    return ['error: ' + e.message];
  }
}

async function main() {
  console.log('=== Pipe Discovery Tool ===\n');
  console.log('Before launch:', listPipes());

  // Launch WITHOUT any pipes from our side – just watch what it creates
  console.log('\nLaunching exe with fake pipe ID "TESTID01"...');
  const proc = cp.spawn(EXE, [], {
    env: { ...process.env, PB_DEBUGGER_Communication: 'TESTID01' },
    stdio: 'ignore',
  });

  // Poll for pipes
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 100));
    const pipes = listPipes();
    if (pipes.length > 0) {
      console.log(`  [${i * 100}ms] PB-related pipes:`, pipes);
    }
    if (proc.exitCode !== null) {
      console.log(`  Program exited (code=${proc.exitCode}) after ${i * 100}ms`);
      break;
    }
  }

  console.log('\nAfter run:', listPipes());
  proc.kill();

  // Also try running without the env var
  console.log('\nLaunching WITHOUT PB_DEBUGGER_Communication...');
  const env2 = { ...process.env };
  delete env2.PB_DEBUGGER_Communication;
  const proc2 = cp.spawn(EXE, [], { env: env2, stdio: 'pipe' });
  let stdout2 = '', stderr2 = '';
  proc2.stdout.on('data', d => { stdout2 += d.toString(); });
  proc2.stderr.on('data', d => { stderr2 += d.toString(); });

  await new Promise(r => {
    proc2.on('exit', code => {
      console.log(`  Exit code: ${code}`);
      if (stdout2) console.log('  stdout:', stdout2.trim());
      if (stderr2) console.log('  stderr:', stderr2.trim());
      r();
    });
    setTimeout(() => { proc2.kill(); r(); }, 5000);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
