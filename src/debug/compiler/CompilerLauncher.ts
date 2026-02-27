import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { CompileResult } from '../types/debugTypes';

export class CompilerLauncher {
  private readonly compiler: string;
  private readonly trace: boolean;
  private readonly platform: NodeJS.Platform;
  private readonly isWindows: boolean;

  constructor(compiler = 'pbcompiler', trace = false, platform: NodeJS.Platform = process.platform) {
    this.compiler = compiler;
    this.trace = trace;
    this.platform = platform;
    this.isWindows = platform === 'win32';
  }

  /**
   * Find PureBasic compiler automatically.
   * Windows: PATH, common installation paths, and Windows registry.
   * Linux/macOS: PATH, PUREBASIC_HOME, and common unix installation paths.
   */
  static async findCompiler(platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
    // 1. First, check if pbcompiler is in PATH
    const pathResult = await CompilerLauncher.findCompilerInPath(platform);
    if (pathResult) {
      return pathResult;
    }

    if (platform === 'win32') {
      // 2. Check common installation paths (including "Compilers" subfolder)
      const commonResult = await CompilerLauncher.findCompilerInCommonLocations(platform);
      if (commonResult) {
        return commonResult;
      }

      // 3. Try to find from Windows registry
      const registryPath = await CompilerLauncher.findCompilerFromRegistry();
      if (registryPath) {
        return registryPath;
      }
    } else {
      const unixResult = await CompilerLauncher.findCompilerInUnixLocations(platform);
      if (unixResult) {
        return unixResult;
      }
    }

    return undefined;
  }

  /**
   * Find pbcompiler in PATH environment variable
   */
  private static async findCompilerInPath(platform: NodeJS.Platform): Promise<string | undefined> {
    const pathEnv = process.env.PATH || process.env.Path || process.env.path;
    if (!pathEnv) {
      return undefined;
    }

    const compilerName = CompilerLauncher.compilerBinaryName(platform);
    const pathDirs = pathEnv.split(path.delimiter);

    for (const dir of pathDirs) {
      const compilerPath = path.join(dir, compilerName);
      try {
        await fs.promises.access(compilerPath);
        return compilerPath;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private static compilerBinaryName(platform: NodeJS.Platform): string {
    return platform === 'win32' ? 'pbcompiler.exe' : 'pbcompiler';
  }

  private static buildCompilerCandidates(baseDir: string, platform: NodeJS.Platform): string[] {
    const compilerName = CompilerLauncher.compilerBinaryName(platform);
    return [
      path.join(baseDir, compilerName),
      path.join(baseDir, 'Compilers', compilerName),
      path.join(baseDir, 'compilers', compilerName),
    ];
  }

  private static async findFirstAccessible(candidates: Iterable<string>): Promise<string | undefined> {
    for (const candidate of candidates) {
      try {
        await fs.promises.access(candidate, fs.constants.F_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /**
   * Find pbcompiler in common Windows install locations and user profile folders.
   * Supports both:
   *   - <PureBasicDir>\pbcompiler.exe
   *   - <PureBasicDir>\Compilers\pbcompiler.exe
   */
  private static async findCompilerInCommonLocations(platform: NodeJS.Platform): Promise<string | undefined> {
    const candidates = new Set<string>();
    const addBase = (baseDir: string) => {
      for (const p of CompilerLauncher.buildCompilerCandidates(baseDir, platform)) {
        candidates.add(p);
      }
    };

    // Common fixed roots.
    addBase('C:\\PureBasic');
    addBase('C:\\PureBasic 6.20');
    addBase('C:\\PureBasic 6.10');
    addBase('C:\\PureBasic 6.00');
    addBase('C:\\PureBasic 5.73');

    // User profile locations.
    const userRoots = new Set<string>([os.homedir(), process.env.USERPROFILE ?? '']);
    for (const root of userRoots) {
      if (!root) continue;
      addBase(path.join(root, 'PureBasic'));
      addBase(path.join(root, 'PureBasic 6.20'));
      addBase(path.join(root, 'PureBasic 6.10'));
      addBase(path.join(root, 'PureBasic 6.00'));
    }

    // Program Files / Program Files (x86): scan all PureBasic* directories.
    const programRoots = new Set<string>([
      process.env.ProgramFiles ?? '',
      process.env['ProgramFiles(x86)'] ?? '',
      process.env.ProgramW6432 ?? '',
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ]);

    for (const root of programRoots) {
      if (!root) continue;
      try {
        const entries = await fs.promises.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (!/^PureBasic(?:\s|$)/i.test(entry.name)) continue;
          addBase(path.join(root, entry.name));
        }
      } catch {
        continue;
      }
    }

    return CompilerLauncher.findFirstAccessible(candidates);
  }

  private static async findCompilerInUnixLocations(platform: NodeJS.Platform): Promise<string | undefined> {
    const candidates = new Set<string>();
    const addBase = (baseDir: string) => {
      for (const p of CompilerLauncher.buildCompilerCandidates(baseDir, platform)) {
        candidates.add(p);
      }
    };

    const pureBasicHome = process.env.PUREBASIC_HOME;
    if (pureBasicHome) {
      addBase(pureBasicHome);
    }

    if (platform === 'darwin') {
      // macOS: PureBasic is typically installed as an .app bundle
      addBase('/Applications/PureBasic.app/Contents/Resources');
      addBase(path.join(os.homedir(), 'Applications/PureBasic.app/Contents/Resources'));
      // Also check Homebrew locations
      addBase('/opt/homebrew/opt/purebasic');
      addBase('/usr/local/opt/purebasic');
    } else {
      // Linux: common installation paths
      addBase('/opt/purebasic');
      addBase('/opt/PureBasic');
      addBase('/usr/share/purebasic');
      addBase('/usr/local/purebasic');
      addBase('/usr/lib/purebasic');
    }

    addBase(path.join(os.homedir(), 'purebasic'));
    addBase(path.join(os.homedir(), 'PureBasic'));

    return CompilerLauncher.findFirstAccessible(candidates);
  }

  /**
   * Find pbcompiler path from Windows registry
   */
  private static async findCompilerFromRegistry(): Promise<string | undefined> {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      // Try to read PureBasic installation path from registry
      const regQueries = [
        'reg query "HKLM\\SOFTWARE\\PureBasic" /v InstallPath 2>nul',
        'reg query "HKLM\\SOFTWARE\\WOW6432Node\\PureBasic" /v InstallPath 2>nul',
        'reg query "HKCU\\SOFTWARE\\PureBasic" /v InstallPath 2>nul',
      ];

      for (const query of regQueries) {
        try {
          const { stdout } = await execAsync(query);
          const match = stdout.match(/InstallPath\s+REG_\w+\s+(.+)/i);
          if (match) {
            const installPath = match[1].trim();
            const compilerPath = await CompilerLauncher.findFirstAccessible(
              CompilerLauncher.buildCompilerCandidates(installPath, 'win32'),
            );
            if (compilerPath) {
              return compilerPath;
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Registry lookup failed, ignore
    }

    return undefined;
  }

  /** Generate a random 8-character hexadecimal pipe ID (e.g. "A3F20C11"). */
  generatePipeId(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  private getOutputPath(sourcePath: string): string {
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const suffix = this.isWindows ? '.exe' : '';
    return path.join(
      os.tmpdir(),
      `pb_debug_${base}_${Date.now()}${suffix}`,
    );
  }

  private getCompileArgs(sourcePath: string, executablePath: string): string[] {
    if (this.isWindows) {
      return [sourcePath, '/DEBUGGER', '/CONSOLE', '/LINENUMBERING', '/OUTPUT', executablePath];
    }
    return [sourcePath, '--debugger', '--console', '--linenumbering', '--output', executablePath];
  }

  /**
   * Detect PUREBASIC_HOME from compiler path.
   * For macOS .app bundle: /xxx/PureBasic.app/Contents/Resources/compilers/pbcompiler
   * For Linux/others: /xxx/purebasic/compilers/pbcompiler
   */
  private static detectPureBasicHome(compilerPath: string): string | undefined {
    // Normalize path
    const normalized = path.normalize(compilerPath);
    
    // Check if it's inside an .app bundle (macOS)
    const appMatch = normalized.match(/(.+\.app\/Contents\/Resources)/i);
    if (appMatch) {
      return appMatch[1];
    }
    
    // Check if it's in a compilers subdirectory
    const compilersIdx = normalized.toLowerCase().indexOf('/compilers/');
    if (compilersIdx > 0) {
      return normalized.substring(0, compilersIdx);
    }
    
    // Check if parent directory exists and might be the home
    const parentDir = path.dirname(normalized);
    if (parentDir && parentDir !== normalized) {
      return parentDir;
    }
    
    return undefined;
  }

  /**
   * Compile `sourcePath` with the PureBasic compiler in debugger mode.
   * Resolves with the path of the generated executable.
   */
  compile(sourcePath: string): Promise<CompileResult> {
    const dir = path.dirname(sourcePath);
    const executablePath = this.getOutputPath(sourcePath);

    return new Promise((resolve, reject) => {
      const args = this.getCompileArgs(sourcePath, executablePath);
      this.log(`Compile: ${this.compiler} ${args.join(' ')}`);

      // Prepare environment with PUREBASIC_HOME if needed
      const env = { ...process.env };
      if (!env.PUREBASIC_HOME) {
        const pbHome = CompilerLauncher.detectPureBasicHome(this.compiler);
        if (pbHome) {
          env.PUREBASIC_HOME = pbHome;
          this.log(`Setting PUREBASIC_HOME=${pbHome}`);
        }
      }

      const proc = cp.spawn(this.compiler, args, { cwd: dir, env });

      let stderr = '';
      let stdout = '';
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.log(`[pbcompiler] ${text.trimEnd()}`);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const errText = stderr.trim();
          const outText = stdout.trim();
          const details = [errText, outText].filter(Boolean).join('\n');
          reject(new Error(
            details
              ? `pbcompiler exited with code ${code}: ${details}`
              : `pbcompiler exited with code ${code}`,
          ));
        } else if (!fs.existsSync(executablePath)) {
          reject(new Error(
            `Compilation appeared to succeed but no executable found at: ${executablePath}`,
          ));
        } else {
          resolve({ executablePath });
        }
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error(
            `PureBasic compiler not found: "${this.compiler}". ` +
            `Ensure pbcompiler is on PATH or set "compiler" in launch.json.`,
          ));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Launch the compiled PureBasic executable with the debug pipe information injected
   * via environment variables.
   */
  launch(executablePath: string, communicationString: string, stopOnEntry = true): cp.ChildProcess {
    this.log(`Launch: ${executablePath}  [comm=${this.sanitizeCommunicationString(communicationString)}]`);

    // Check if executable exists and log its stats
    try {
      const stats = fs.statSync(executablePath);
      this.log(`Executable stats: size=${stats.size}, mode=${stats.mode.toString(8)}`);
    } catch (err) {
      this.log(`Warning: Could not stat executable: ${err}`);
    }

    // Prepare environment with required variables
    // PB_DEBUGGER_Options format: <unicode>;<callOnStart>;<callOnEnd>;<bigEndian>
    // callOnStart: 1 = stop at entry, 0 = run until breakpoint
    const callOnStart = stopOnEntry ? '1' : '0';
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PB_DEBUGGER_Communication: communicationString,
      PB_DEBUGGER_Options: `1;${callOnStart};0;0`,  // unicode=1, callOnStart=dynamic, callOnEnd=0, bigEndian=0
    };
    
    // Ensure PUREBASIC_HOME is set for the debuggee (needed on macOS/Linux)
    if (!env.PUREBASIC_HOME) {
      const pbHome = CompilerLauncher.detectPureBasicHome(this.compiler);
      if (pbHome) {
        env.PUREBASIC_HOME = pbHome;
        this.log(`Setting PUREBASIC_HOME for debuggee: ${pbHome}`);
      }
    }
    
    this.log(`Environment PB_DEBUGGER_Options: ${env.PB_DEBUGGER_Options}`);
    this.log(`Environment PUREBASIC_HOME: ${env.PUREBASIC_HOME ?? '(not set)'}`);
    
    // FIFO mode is detected from the communication string for logging only.
    // Current verification shows the debuggee reads PB_DEBUGGER_Communication from env,
    // and does not require a fixed /tmp/.pbdebugger.out path.
    const useFifo = communicationString.startsWith('FifoFiles;');
    
    const proc = cp.spawn(executablePath, [], {
      env,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    this.log(`Debuggee process spawned with pid=${proc.pid}, useFifo=${useFifo}`);
    
    // Capture stdout/stderr for debugging
    proc.stdout?.on('data', (data: Buffer) => {
      this.log(`[Debuggee stdout] ${data.toString().trim()}`);
    });
    proc.stderr?.on('data', (data: Buffer) => {
      this.log(`[Debuggee stderr] ${data.toString().trim()}`);
    });
    
    proc.on('error', (err) => {
      process.stderr.write(`[PBDebug] Launch error: ${err.message}\n`);
    });
    
    proc.on('exit', (code, signal) => {
      this.log(`Debuggee process exited with code=${code}, signal=${signal}`);
    });
    
    return proc;
  }

  private sanitizeCommunicationString(communicationString: string): string {
    if (!communicationString) return '<empty>';
    const [mode, ...rest] = communicationString.split(';');
    const lowerMode = (mode ?? '').toLowerCase();
    if (lowerMode === 'networkclient') {
      return 'NetworkClient;<redacted>';
    }
    if (lowerMode === 'namedpipes' || lowerMode === 'fifofiles') {
      return `${mode};<redacted:${rest.length}>`;
    }
    return `${mode || 'Unknown'};<redacted>`;
  }

  private log(msg: string): void {
    if (this.trace) {
      process.stderr.write(`[CompilerLauncher] ${msg}\n`);
    }
  }
}
