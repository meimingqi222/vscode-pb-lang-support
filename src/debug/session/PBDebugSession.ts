import {
  DebugSession,
  InitializedEvent,
  TerminatedEvent,
  StoppedEvent,
  ContinuedEvent,
  OutputEvent,
  Thread,
  StackFrame,
  Source,
  Breakpoint,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

import { LaunchRequestArguments, CommandInfo, CompileResult } from '../types/debugTypes';
import {
  PBCommand,
  PBEvent,
  StepType,
  BreakPointAction,
  StopReason,
  makeDebuggerLine,
  debuggerLineFile,
  debuggerLineRow0,
} from '../protocol/commands';
import { CompilerLauncher } from '../compiler/CompilerLauncher';
import { SessionStateMachine } from './sessionState';
import { parseNames, parseValues } from '../protocol/variableParser';
import { createTransport } from '../transport/createTransport';
import { IDebugTransport, DebugTransportKind } from '../transport/IDebugTransport';

const THREAD_ID         = 1;
const SCOPE_GLOBALS_REF = 1000;
const SCOPE_LOCALS_REF  = 1001;

const PB_POINTER_MASK = 0x80;
const PB_TYPE_MASK    = 0x3F;
const SCIN_REQUESTOR  = asciiConst('S', 'C', 'I', 'N');

interface ProcedureRange {
  start: number;
  end: number;
  name: string;
  moduleName?: string;
}

function asciiConst(a: string, b: string, c: string, d: string): number {
  return (a.charCodeAt(0) & 0xFF)
    | ((b.charCodeAt(0) & 0xFF) << 8)
    | ((c.charCodeAt(0) & 0xFF) << 16)
    | ((d.charCodeAt(0) & 0xFF) << 24);
}

export class PBDebugSession extends DebugSession {

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private state      = new SessionStateMachine();
  private transport: IDebugTransport | null = null;
  private transportKind: DebugTransportKind = 'pipe';
  private launcher:  CompilerLauncher | null = null;
  private debugProc: cp.ChildProcess  | null = null;
  private trace = false;
  private secureTrace = false;
  private is64bit = false;
  private isUnicode = true;
  private procedureRangesCache = new Map<string, ProcedureRange[]>();

  /**
   * Maps protocol file index (0 = main file) → absolute file path.
   * Populated from the COMMAND_Init data payload.
   */
  private fileNumToPath = new Map<number, string>();

  /** Last known stopped position (1-based line, protocol file index). */
  private stoppedFileNum = 0;
  private stoppedLine    = 1;
  private activeFrameId  = 0;

  /**
   * Whether the first entry stop (CallDebuggerOnStart) has been processed.
   * Used to auto-skip the entry stop when stopOnEntry=false.
   */
  private firstStopSeen = false;

  /**
   * Breakpoints stored per source-file path while program is not yet running.
   * Sent in bulk after the pipe connection is established.
   */
  private pendingBreakpoints = new Map<string, number[]>();

  /**
   * Callbacks waiting for a specific PBEvent from PipeA.
   * onMessage delivers matching events here before the switch-case handlers.
   */
  private pendingResponse = new Map<number, Array<(msg: CommandInfo) => void>>();

  // Saved across launchRequest / configurationDoneRequest
  private launchArgs:    LaunchRequestArguments | null = null;
  private compileResult: CompileResult | null = null;
  private compilePromise: Promise<CompileResult> | null = null;
  private pipeId: string | null = null;
  private communicationString: string | null = null;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  // -------------------------------------------------------------------------
  // DAP lifecycle
  // -------------------------------------------------------------------------

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    this.log('initializeRequest received');
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsEvaluateForHovers:        true,
      supportTerminateDebuggee:         true,
      supportsStepBack:                 false,
    };
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  /**
   * DAP `launch` request.
   * Compiles the source and creates the named pipes, but does NOT yet launch
   * the executable.  The actual launch happens in configurationDoneRequest so
   * VSCode can send all breakpoints first.
   */
  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments,
  ): Promise<void> {
    this.trace = args.trace ?? false;
    this.secureTrace = args.secureTrace ?? false;
    this.launchArgs = args;
    this.pendingBreakpoints.clear(); // Clear any stale breakpoints from previous sessions
    this.firstStopSeen = false;
    this.procedureRangesCache.clear();
    this.fileNumToPath.clear();
    this.transportKind = 'pipe';
    this.communicationString = null;
    this.log('launchRequest started');

    // File 0 = main source file (protocol convention)
    this.fileNumToPath.set(0, path.resolve(args.program));

    // Resolve compiler path: use provided path, or auto-detect
    let compilerPath = args.compiler;
    if (!compilerPath) {
      this.log('Compiler not specified in launch.json, auto-detecting...');
      compilerPath = await CompilerLauncher.findCompiler();
      if (compilerPath) {
        this.log(`Auto-detected compiler: ${compilerPath}`);
      } else {
        this.log('Could not auto-detect PureBasic compiler');
      }
    }

    this.launcher = new CompilerLauncher(compilerPath ?? 'pbcompiler', this.trace);
    this.pipeId   = this.launcher.generatePipeId();
    this.communicationString = null;

    try {
      if (!this.pipeId) throw new Error('Failed to generate transport identifier');

      // Create transport (server must be listening before the executable starts)
      this.transport = createTransport({
        platform: process.platform,
        transport: args.transport,
        pipeId: this.pipeId,
        debugHost: args.debugHost,
        debugPort: args.debugPort,
        debugPassword: args.debugPassword,
      });
      this.transportKind = this.transport.kind;

      this.transport.on('message', (msg: CommandInfo) => this.onMessage(msg));
      this.transport.on('error',   (err: Error) => this.log(`Transport(${this.transportKind}) error: ${err.message}`));
      this.transport.on('log',     (msg: string) => this.log(`[Transport] ${msg}`));
      this.transport.on('end', () => {
        if (!this.state.isTerminated()) {
          this.state.transition('terminated');
          this.sendEvent(new TerminatedEvent());
        }
      });

      this.log(`Creating transport [kind=${this.transportKind}] [id=${this.pipeId}]`);
      await this.transport.listen();
      this.communicationString = this.transport.getCommunicationString();
      this.log(`Transport ready [kind=${this.transportKind}]`);

      this.log(`Compiling: ${args.program}`);
      this.sendEvent(new OutputEvent(
        `Compiling ${path.basename(args.program)}...\n`, 'console',
      ));

      // Store the promise so configurationDoneRequest can wait for it
      this.compilePromise = this.launcher.compile(args.program);
      this.compileResult = await this.compilePromise;
      this.log(`Compiled → ${this.compileResult.executablePath}`);
      this.sendEvent(new OutputEvent('Compilation successful.\n', 'console'));

      this.log('Sending launch response...');
      this.sendResponse(response);
      this.log('Launch response sent');
      // VSCode will now send setBreakpoints(…) × N then configurationDone
    } catch (err) {
      this.log(`Launch failed with error: ${(err as Error).message}`);
      this.transport?.close();
      this.transport = null;
      this.communicationString = null;
      this.sendEvent(new OutputEvent(
        `Launch failed: ${this.safeErrorMessage(err)}\n`, 'stderr',
      ));
      response.success = false;
      response.message = this.safeErrorMessage(err);
      this.sendResponse(response);
    }
  }

  /**
   * DAP `configurationDone` request.
   * Called after VSCode has sent all setBreakpoints requests.
   * Now we launch the executable and wait for the pipe connection.
   */
  protected async configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments,
  ): Promise<void> {
    this.log('configurationDoneRequest received');
    this.sendResponse(response);

    // launchRequest may still be initializing (compiler auto-detect, pipe setup).
    if (!this.transport || !this.launcher || !this.pipeId) {
      this.log('configurationDoneRequest: launch setup not ready yet, waiting...');
      const setupReady = await this.waitForLaunchSetup(15_000);
      if (!setupReady) {
        this.log(`configurationDoneRequest: early return - transport=${!!this.transport}(${this.transportKind}), launcher=${!!this.launcher}, compileResult=${!!this.compileResult}, pipeId=${!!this.pipeId}`);
        return;
      }
    }

    // compilePromise is created inside launchRequest after pipe setup.
    if (!this.compileResult && !this.compilePromise) {
      this.log('configurationDoneRequest: compilation not started yet, waiting...');
      const compilationStarted = await this.waitForCompilationStart(15_000);
      if (!compilationStarted) {
        this.log(`configurationDoneRequest: early return - transport=${!!this.transport}(${this.transportKind}), launcher=${!!this.launcher}, compileResult=${!!this.compileResult}, pipeId=${!!this.pipeId}`);
        return;
      }
    }

    // Wait for compile to finish if it's still in progress
    if (!this.compileResult && this.compilePromise) {
      this.log('Waiting for compilation to finish...');
      try {
        this.compileResult = await this.compilePromise;
        this.log(`Compilation finished: ${this.compileResult.executablePath}`);
      } catch (err) {
        this.log(`Compilation failed: ${(err as Error).message}`);
        this.sendEvent(new TerminatedEvent());
        return;
      }
    }

    if (!this.transport || !this.launcher || !this.compileResult || !this.pipeId) {
      this.log(`configurationDoneRequest: early return - transport=${!!this.transport}(${this.transportKind}), launcher=${!!this.launcher}, compileResult=${!!this.compileResult}, pipeId=${!!this.pipeId}`);
      return; // launchRequest failed earlier
    }

    try {
      this.state.transition('launching');
      this.log(`Launching: ${this.compileResult.executablePath}`);
      const commString = this.communicationString ?? this.transport.getCommunicationString();
      this.log(`Communication string: ${commString}`);
      this.log(`Transport kind: ${this.transportKind}, isConnected: ${this.transport.isConnected}`);
      
      // For FIFO transport, we need to launch first, then connect
      if (this.transportKind === 'fifo') {
        this.log('FIFO transport: launching program first, then connecting...');
        this.debugProc = this.launcher.launch(this.compileResult.executablePath, commString, this.launchArgs?.stopOnEntry);
        this.debugProc.on('exit', (code, signal) => this.log(`Debuggee exited (code=${code}, signal=${signal})`));
        
        // Log process events
        this.debugProc.on('error', (err) => this.log(`Debuggee process error: ${err.message}`));
        if (this.debugProc.stdout) {
          this.debugProc.stdout.on('data', (data) => this.log(`[Debuggee stdout] ${data.toString().trim()}`));
        }
        if (this.debugProc.stderr) {
          this.debugProc.stderr.on('data', (data) => this.log(`[Debuggee stderr] ${data.toString().trim()}`));
        }
        
        // Wait a bit for program to start and read the connection file
        this.log('Waiting for program to start...');
        await new Promise(r => setTimeout(r, 500));
        
        // Now connect to FIFOs
        this.log('Connecting to FIFOs...');
        await (this.transport as any).connect();
        this.log('FIFOs connected');
      } else {
        // Network/Pipe transport: connect first, then launch
        this.debugProc = this.launcher.launch(this.compileResult.executablePath, commString, this.launchArgs?.stopOnEntry);
        this.debugProc.on('exit', (code, signal) => this.log(`Debuggee exited (code=${code}, signal=${signal})`));
        
        // Log process events
        this.debugProc.on('error', (err) => this.log(`Debuggee process error: ${err.message}`));
        if (this.debugProc.stdout) {
          this.debugProc.stdout.on('data', (data) => this.log(`[Debuggee stdout] ${data.toString().trim()}`));
        }
        if (this.debugProc.stderr) {
          this.debugProc.stderr.on('data', (data) => this.log(`[Debuggee stderr] ${data.toString().trim()}`));
        }

        await this.waitForConnection(15_000);
      }
      this.log('Both pipes connected');

      // Consume Init (cmd=0) and ExeMode (cmd=2) — these arrive before any commands
      await this.performHandshake(5_000);

      // Send any breakpoints set before the program was ready
      // Note: On macOS, breakpoints must be sent after handshake but before Run
      this.flushPendingBreakpoints();
      
      // Wait for breakpoints to be processed
      this.log('Waiting for breakpoints to be processed...');
      await new Promise(r => setTimeout(r, 500));

      // Always send Run; entry stop (Stopped cmd=3, reason=CallDebugger) will
      // arrive and be handled by onMessage → handleStopped.
      this.log('Sending Run command...');
      this.state.transition('running');
      this.transport.send({ command: PBCommand.Run });
      this.log('Run command sent');

    } catch (err) {
      this.sendEvent(new OutputEvent(
        `Debugger error: ${(err as Error).message}\n`, 'stderr',
      ));
      this.cleanup();
      this.sendEvent(new TerminatedEvent());
    }
  }

  private async waitForLaunchSetup(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.transport && this.launcher && this.pipeId) return true;
      if (this.state.isTerminated()) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  private async waitForCompilationStart(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.compileResult || this.compilePromise) return true;
      if (this.state.isTerminated()) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments,
  ): void {
    const shouldTerminate = args.terminateDebuggee !== false;
    this.cleanup(shouldTerminate);
    this.sendResponse(response);
  }

  // -------------------------------------------------------------------------
  // Breakpoints
  // -------------------------------------------------------------------------

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    this.log(`setBreakPointsRequest received: ${args.source.path}`);
    const filePath = args.source.path ?? '';
    const lines    = (args.breakpoints ?? []).map((bp) => bp.line);

    // Always store (for flush after connection)
    this.pendingBreakpoints.set(filePath, lines);

    // If we're already connected, send immediately
    if (this.transport?.isConnected && this.state.canSendCommand()) {
      this.sendBreakpointsForFile(filePath, lines);
    }

    response.body = {
      breakpoints: lines.map((line) => new Breakpoint(true, line)),
    };
    this.sendResponse(response);
  }

  // -------------------------------------------------------------------------
  // Execution control
  // -------------------------------------------------------------------------

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
  ): void {
    this.state.transition('running');
    this.transport?.send({ command: PBCommand.Run });
    response.body = { allThreadsContinued: true };
    this.sendResponse(response);
    this.sendEvent(new ContinuedEvent(THREAD_ID, true));
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments,
  ): void {
    this.transport?.send({ command: PBCommand.Stop });
    this.sendResponse(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
  ): void {
    this.state.transition('running');
    this.transport?.send({ command: PBCommand.Step, value2: StepType.Over });
    this.sendResponse(response);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
  ): void {
    this.state.transition('running');
    this.transport?.send({ command: PBCommand.Step, value2: StepType.Into });
    this.sendResponse(response);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments,
  ): void {
    this.state.transition('running');
    this.transport?.send({ command: PBCommand.Step, value2: StepType.Out });
    this.sendResponse(response);
  }

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = { threads: [new Thread(THREAD_ID, 'Main Thread')] };
    this.sendResponse(response);
  }

  // -------------------------------------------------------------------------
  // Stack & variables
  // -------------------------------------------------------------------------

  protected async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments,
  ): Promise<void> {
    this.log('stackTraceRequest received');
    const sourcePath = this.fileNumToPath.get(this.stoppedFileNum) ?? this.launchArgs?.program ?? '';
    this.log(`Using source for StackTrace: ${sourcePath}`);

    try {
      if (!this.transport?.isConnected || this.state.isTerminated()) {
        throw new Error('Debuggee is not available for history');
      }

      const histMsg = await this.sendAndWait(
        PBCommand.GetHistory, PBEvent.History, {}, 3_000,
      );
      const frames = this.parseHistory(histMsg.data);
      this.log(`Got ${frames.length} frames from history`);

      const currentPacked = histMsg.value2 >>> 0;
      const hasCurrent = currentPacked !== 0xFFFFFFFF;
      const currentFileNum = hasCurrent ? debuggerLineFile(currentPacked) : this.stoppedFileNum;
      const currentLine = hasCurrent ? debuggerLineRow0(currentPacked) + 1 : this.stoppedLine;
      const currentSourcePath = this.fileNumToPath.get(currentFileNum) ?? sourcePath;
      const currentFrameName = this.inferFrameName(currentSourcePath, currentLine);

      const stackFrames: StackFrame[] = [
        new StackFrame(
          0,
          currentFrameName,
          currentSourcePath ? new Source(path.basename(currentSourcePath), currentSourcePath) : undefined,
          currentLine,
        ),
      ];

      const orderedFrames = [...frames].reverse();
      for (let i = 0; i < orderedFrames.length; i++) {
        const frame = orderedFrames[i];
        const fileNum = debuggerLineFile(frame.packedLine);
        const line1 = debuggerLineRow0(frame.packedLine) + 1;
        const frameSourcePath = this.fileNumToPath.get(fileNum) ?? sourcePath;
        const inferredName = this.inferFrameName(frameSourcePath, line1);
        const historyName = this.parseHistoryProcedureName(frame.procedureName);
        const frameName = this.buildStackFrameName(inferredName, historyName);
        this.log(`Frame ${i + 1}: ${frameName} at ${frameSourcePath}:${line1} (${frame.procedureName})`);
        stackFrames.push(new StackFrame(
          i + 1,
          frameName,
          frameSourcePath ? new Source(path.basename(frameSourcePath), frameSourcePath) : undefined,
          line1,
        ));
      }

      response.body = {
        stackFrames,
        totalFrames: stackFrames.length,
      };
    } catch (err) {
      // Fallback: synthesise a single frame from the last Stopped event
      this.log(`History request failed: ${err}, using fallback`);
      this.log(`Fallback frame: ${sourcePath}:${this.stoppedLine}`);
      response.body = {
        stackFrames: [
          new StackFrame(
            0,
            '[main]',
            sourcePath ? new Source(path.basename(sourcePath), sourcePath) : undefined,
            this.stoppedLine,
          ),
        ],
        totalFrames: 1,
      };
    }
    this.sendResponse(response);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments,
  ): void {
    this.log('scopesRequest received');
    this.activeFrameId = args.frameId ?? 0;
    response.body = {
      scopes: [
        {
          name: 'Locals',
          variablesReference: SCOPE_LOCALS_REF,
          expensive: false,
          presentationHint: 'locals',
        },
        {
          name: 'Globals',
          variablesReference: SCOPE_GLOBALS_REF,
          expensive: false,
          presentationHint: 'locals',
        },
      ],
    };
    this.sendResponse(response);
    this.log('scopesRequest response sent');
  }

  protected async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    this.log(`variablesRequest received: variablesReference=${args.variablesReference}`);
    try {
      let variables: DebugProtocol.Variable[] = [];

      if (args.variablesReference === SCOPE_GLOBALS_REF) {
        this.log('Fetching globals...');
        variables = await this.fetchGlobals();
        this.log(`Fetched ${variables.length} globals`);
      } else if (args.variablesReference === SCOPE_LOCALS_REF) {
        this.log(`Fetching locals for frame ${this.activeFrameId}...`);
        variables = await this.fetchLocals(this.activeFrameId);
        this.log(`Fetched ${variables.length} locals`);
      }

      response.body = { variables };
    } catch (err) {
      this.log(`variablesRequest error: ${err}`);
      response.body = { variables: [] };
    }
    this.log('Sending variables response');
    this.sendResponse(response);
  }

  // -------------------------------------------------------------------------
  // Expression evaluation
  // -------------------------------------------------------------------------

  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    try {
      const expression = this.normalizeExpression(args.expression);
      const exprBuf = this.encodeExpression(expression);
      const contextLine = makeDebuggerLine(this.stoppedFileNum, Math.max(0, this.stoppedLine - 1));
      const resultMsg = await this.sendAndWait(
        PBCommand.EvaluateExpressionWithStruct,
        PBEvent.Expression,
        { value1: SCIN_REQUESTOR, value2: contextLine, data: exprBuf },
        3_000,
      );
      response.body = {
        result: this.parseExpressionResult(resultMsg),
        variablesReference: 0,
      };
    } catch (err) {
      this.log(`evaluateRequest error: ${err}`);
      response.body = { result: '<evaluation error>', variablesReference: 0 };
    }
    this.sendResponse(response);
  }

  private normalizeExpression(expression: string): string {
    return (expression ?? '')
      .replace(/^\uFEFF/, '')
      .replace(/^\uFFFD+/, '')
      .trim();
  }

  private encodeExpression(expression: string): Buffer {
    if (this.isUnicode) {
      return Buffer.from(expression + '\0', 'utf16le');
    }
    return Buffer.from(expression + '\0', 'utf8');
  }

  private readPBString(data: Buffer, offset: number): { value: string; nextOffset: number } {
    if (offset >= data.length) {
      return { value: '', nextOffset: offset };
    }

    if (this.isUnicode) {
      let end = offset;
      while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) {
        end += 2;
      }
      const value = data.slice(offset, end).toString('utf16le');
      const nextOffset = end + 2 <= data.length ? end + 2 : data.length;
      return { value, nextOffset };
    }

    const end = data.indexOf(0, offset);
    if (end === -1) {
      return { value: data.slice(offset).toString('utf8'), nextOffset: data.length };
    }
    return {
      value: data.slice(offset, end).toString('utf8'),
      nextOffset: end + 1,
    };
  }

  private parseExpressionResult(msg: CommandInfo): string {
    switch (msg.value2) {
      case 0:
        return msg.data.toString('utf8').replace(/\0/g, '').trim();
      case 1:
        return '';
      case 2: {
        if (msg.data.length < 8) return '<invalid expression result>';
        const value = msg.data.readBigInt64LE(0).toString();
        const name = this.readPBString(msg.data, 8).value;
        return name ? `${name} = ${value}` : value;
      }
      case 3: {
        if (msg.data.length < 8) return '<invalid expression result>';
        const value = msg.data.readDoubleLE(0).toString();
        const name = this.readPBString(msg.data, 8).value;
        return name ? `${name} = ${value}` : value;
      }
      case 4: {
        const str = this.readPBString(msg.data, 0);
        const name = this.readPBString(msg.data, str.nextOffset).value;
        return name ? `${name} = "${str.value}"` : str.value;
      }
      case 5:
        return '<structure>';
      default:
        return msg.data.toString(this.isUnicode ? 'utf16le' : 'utf8').replace(/\0/g, '').trim();
    }
  }

  // -------------------------------------------------------------------------
  // Internal: message dispatch
  // -------------------------------------------------------------------------

  private onMessage(msg: CommandInfo): void {
    this.log(`onMessage received: cmd=${msg.command}, value1=${msg.value1}, value2=${msg.value2}, dataLen=${msg.data.length}`);
    
    // Check if there's a pending async response waiting for this command ID
    const pendingQueue = this.pendingResponse.get(msg.command);
    const pending = pendingQueue?.shift();
    if (pending) {
      this.log(`Delivering message to pending handler for cmd=${msg.command}`);
      if (pendingQueue && pendingQueue.length === 0) {
        this.pendingResponse.delete(msg.command);
      }
      pending(msg);
      return;
    }

    // Unsolicited events from the debuggee
    switch (msg.command) {
      case PBEvent.Init:      // 0
        this.log(`Init message received (late)`);
        if (msg.value2 !== 12) {
          this.log(`Warning: protocol version mismatch (expected 12, got ${msg.value2})`);
        }
        this.parseIncludedFiles(msg.data);
        break;
      case PBEvent.ExeMode:   // 2 – executable mode info, no action needed
        this.log(`ExeMode: flags=${msg.value1},${msg.value2}`);
        this.isUnicode = (msg.value1 & 1) !== 0;
        this.is64bit = (msg.value1 & 4) !== 0;
        this.log(`String mode: ${this.isUnicode ? 'Unicode' : 'ANSI'}`);
        this.log(`Detected architecture: ${this.is64bit ? '64-bit' : '32-bit'}`);
        break;
      case PBEvent.Stopped:   // 3
        this.handleStopped(msg);
        break;
      case PBEvent.End:       // 1
        this.handleEnd(msg);
        break;
      case PBEvent.Error:     // 8
        this.handlePBError(msg);
        break;
      case PBEvent.Debug:         // 5
      case PBEvent.DebugDouble:   // 6
      case PBEvent.DebugQuad:     // 7
        this.handleDebugOutput(msg);
        break;
      case 29:  // Unknown command (possibly heartbeat/status)
        this.log(`Unknown cmd=29 received (possibly heartbeat/status)`);
        break;
      default:
        this.log(`Unhandled event from program: cmd=${msg.command}`);
    }
  }

  private handleStopped(msg: CommandInfo): void {
    // Decode packed file+line from Value1
    // MakeDebuggerLine: bits[31:20]=fileIndex, bits[19:0]=line0 (0-based)
    const fileNum = debuggerLineFile(msg.value1);
    const line0   = debuggerLineRow0(msg.value1);
    const line1   = line0 + 1;  // convert to 1-based for DAP
    this.log(`Stopped event: fileNum=${fileNum}, line=${line1}, reason=${msg.value2}`);

    this.stoppedFileNum = fileNum;
    this.stoppedLine    = line1;
    this.state.transition('stopped');

    const reason = msg.value2;

    // The very first stop with CallDebugger reason is the entry stop from
    // CallDebuggerOnStart=1 in PB_DEBUGGER_Options.
    if (reason === StopReason.CallDebugger && !this.firstStopSeen) {
      this.firstStopSeen = true;
      if (this.launchArgs?.stopOnEntry === false) {
        // User wants to run past entry; auto-continue
        this.state.transition('running');
        this.transport?.send({ command: PBCommand.Run });
        return;
      }
      this.sendEvent(new StoppedEvent('entry', THREAD_ID));
      return;
    }

    // Map stop reason to DAP reason string
    let dapReason: string;
    switch (reason) {
      case StopReason.Breakpoint:   dapReason = 'breakpoint'; break;
      case StopReason.UserStop:     dapReason = 'pause';      break;
      case StopReason.BeforeEnd:    dapReason = 'entry';      break;
      case StopReason.StepComplete: dapReason = 'step';       break;
      default:                      dapReason = 'step';       break;
    }
    this.log(`Sending StoppedEvent to VS Code: reason=${dapReason}, threadId=${THREAD_ID}`);
    this.sendEvent(new StoppedEvent(dapReason, THREAD_ID));
  }

  private handleEnd(msg: CommandInfo): void {
    const exitCode = msg.value1;
    this.sendEvent(new OutputEvent(`Program exited (code ${exitCode})\n`, 'console'));
    this.state.transition('terminated');
    this.sendEvent(new TerminatedEvent());
    // Program already ended naturally, no need to kill it
    this.cleanup(false);
  }

  private handlePBError(msg: CommandInfo): void {
    const text = msg.data.length > 0
      ? msg.data.toString('utf16le').replace(/\0/g, '')
      : 'Runtime error';
    this.sendEvent(new OutputEvent(`Runtime error: ${text}\n`, 'stderr'));
    this.state.transition('stopped');
    this.sendEvent(new StoppedEvent('exception', THREAD_ID));
  }

  private handleDebugPrint(msg: CommandInfo): void {
    if (msg.value1 === 5) {
      // Integer/long debug output carried in Value2.
      this.sendEvent(new OutputEvent(msg.value2.toString() + '\n', 'stdout'));
      return;
    }

    if (msg.value1 === 9) {
      // Float debug output is packed as IEEE754 float in Value2.
      const raw = Buffer.alloc(4);
      raw.writeUInt32LE(msg.value2, 0);
      this.sendEvent(new OutputEvent(raw.readFloatLE(0).toString() + '\n', 'stdout'));
      return;
    }

    const text = msg.data.length > 0
      ? msg.data.toString('utf16le').replace(/\0/g, '')
      : '';
    this.sendEvent(new OutputEvent(text + '\n', 'stdout'));
  }

  private handleDebugDouble(msg: CommandInfo): void {
    const raw = Buffer.alloc(8);
    raw.writeUInt32LE(msg.value1, 0);
    raw.writeUInt32LE(msg.value2, 4);
    this.sendEvent(new OutputEvent(raw.readDoubleLE(0).toString() + '\n', 'stdout'));
  }

  private handleDebugQuad(msg: CommandInfo): void {
    const raw = Buffer.alloc(8);
    raw.writeUInt32LE(msg.value1, 0);
    raw.writeUInt32LE(msg.value2, 4);
    this.sendEvent(new OutputEvent(raw.readBigInt64LE(0).toString() + '\n', 'stdout'));
  }

  private handleDebugOutput(msg: CommandInfo): void {
    switch (msg.command) {
      case PBEvent.Debug:
        this.handleDebugPrint(msg);
        break;
      case PBEvent.DebugDouble:
        this.handleDebugDouble(msg);
        break;
      case PBEvent.DebugQuad:
        this.handleDebugQuad(msg);
        break;
      default:
        this.log(`Unhandled debug output command: ${msg.command}`);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: async helpers
  // -------------------------------------------------------------------------

  private waitForConnection(timeoutMs: number): Promise<void> {
    this.log(`waitForConnection: transport=${!!this.transport}, isConnected=${this.transport?.isConnected}`);
    if (this.transport?.isConnected) {
      this.log('waitForConnection: already connected');
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.log(`waitForConnection: TIMEOUT after ${timeoutMs}ms`);
          reject(new Error('Timed out waiting for PureBasic program to connect'));
        },
        timeoutMs,
      );
      this.transport!.once('connected', () => {
        this.log('waitForConnection: connected event received');
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Consume the COMMAND_Init (cmd=0) and COMMAND_ExeMode (cmd=2) messages that
   * the program sends immediately after connecting to both pipes.
   *
   * COMMAND_Init carries:
   *   value1 = number of additional included source files
   *   value2 = protocol version (must be 12)
   *   data   = null-terminated UTF-8 path list:
   *              [0] working directory
   *              [1] main source file   ← protocol file index 0
   *              [2..] included files   ← protocol file indices 1, 2, …
   *
   * COMMAND_ExeMode carries executable mode flags (OS/arch/Unicode).
   *
   * Both are consumed via pendingResponse so they don't reach the switch-case
   * handlers in onMessage.  Times out after 3 s to tolerate unusual builds.
   */
  private performHandshake(timeoutMs = 3_000): Promise<void> {
    this.log(`performHandshake starting with timeout=${timeoutMs}ms`);
    return new Promise((resolve, reject) => {
      const removePending = (eventId: number): void => {
        const queue = this.pendingResponse.get(eventId);
        if (!queue || queue.length === 0) {
          this.pendingResponse.delete(eventId);
          return;
        }
        queue.shift();
        if (queue.length === 0) {
          this.pendingResponse.delete(eventId);
        }
      };

      const pushPending = (eventId: number, callback: (msg: CommandInfo) => void): void => {
        const queue = this.pendingResponse.get(eventId);
        if (queue) {
          queue.push(callback);
          return;
        }
        this.pendingResponse.set(eventId, [callback]);
      };

      const timer = setTimeout(() => {
        this.log(`Handshake timeout after ${timeoutMs}ms - checking pending queue state`);
        const initQueue = this.pendingResponse.get(PBEvent.Init);
        const exeModeQueue = this.pendingResponse.get(PBEvent.ExeMode);
        this.log(`Pending queues - Init: ${initQueue?.length ?? 0}, ExeMode: ${exeModeQueue?.length ?? 0}`);
        removePending(PBEvent.Init);
        removePending(PBEvent.ExeMode);
        this.log('Handshake timeout – rejecting');
        reject(new Error(`Handshake timeout after ${timeoutMs}ms: Init/ExeMode not received`));
      }, timeoutMs);

      // Consume Init: parse the file-path list and validate version
      pushPending(PBEvent.Init, (msg) => {
        this.log(`Init rx: version=${msg.value2} numFiles=${msg.value1}`);
        if (msg.value2 !== 12) {
          this.log(`Warning: protocol version mismatch (expected 12, got ${msg.value2})`);
        }
        this.parseIncludedFiles(msg.data);
      });

      // Consume ExeMode: the last message before the program waits for commands
      pushPending(PBEvent.ExeMode, (msg) => {
        clearTimeout(timer);
        this.log(`ExeMode rx: flags=${msg.value1},${msg.value2}`);
        this.isUnicode = (msg.value1 & 1) !== 0;
        // Check 64-bit flag: bit 2 of value1 (value 4)
        this.is64bit = (msg.value1 & 4) !== 0;
        this.log(`String mode: ${this.isUnicode ? 'Unicode' : 'ANSI'}`);
        this.log(`Detected architecture: ${this.is64bit ? '64-bit' : '32-bit'}`);
        // Clean up Init entry in case it hasn't fired yet (shouldn't happen)
        removePending(PBEvent.Init);
        resolve();
      });
    });
  }

  /**
   * Parse the null-terminated UTF-8 path list from COMMAND_Init data.
   *
   * Layout:
   *   strings[0] = working directory  (no protocol file number)
   *   strings[1] = main source file   → protocol file 0 (already set from launchArgs)
   *   strings[2] = first IncludeFile  → protocol file 1
   *   strings[3] = second IncludeFile → protocol file 2
   *   …
   */
  private parseIncludedFiles(data: Buffer): void {
    const strings: string[] = [];
    let offset = 0;
    while (offset < data.length) {
      const nullPos = data.indexOf(0, offset);
      const end = nullPos === -1 ? data.length : nullPos;
      const s = data.slice(offset, end).toString('utf8');
      // Always push to preserve positional layout (strings[0]=workdir, strings[1]=main, strings[2+]=includes)
      strings.push(s);
      offset = nullPos === -1 ? data.length : nullPos + 1;
    }

    this.log(`Init file list entries: ${JSON.stringify(strings)}`);

    const workspaceDir = strings[0] || path.dirname(this.launchArgs?.program ?? process.cwd());
    const resolveProtocolPath = (filePath: string): string => {
      if (!filePath) return '';
      if (path.isAbsolute(filePath)) return path.normalize(filePath);
      return path.normalize(path.resolve(workspaceDir, filePath));
    };

    // strings[1] = main source file, if available from protocol use it
    if (strings.length > 1) {
      this.fileNumToPath.set(0, resolveProtocolPath(strings[1]));
    }

    // strings[2..] = included files → protocol file indices 1, 2, …
    for (let i = 2; i < strings.length; i++) {
      this.fileNumToPath.set(i - 1, resolveProtocolPath(strings[i]));
    }

    this.log(`File map: ${this.fileNumToPath.size} entries`);
  }

  /**
   * Send `command` and return a Promise that resolves when `expectedEvent`
   * arrives from the debuggee, or rejects after `timeoutMs`.
   */
  private sendAndWait(
    command: PBCommand,
    expectedEvent: PBEvent,
    params: { value1?: number; value2?: number; data?: Buffer },
    timeoutMs: number,
  ): Promise<CommandInfo> {
    return new Promise((resolve, reject) => {
      if (!this.transport?.isConnected) {
        reject(new Error('Transport not connected'));
        return;
      }

      // Create callback reference so we can remove the correct one on timeout
      let callback: ((msg: CommandInfo) => void) | null = null;

      const timer = setTimeout(() => {
        const queue = this.pendingResponse.get(expectedEvent);
        if (queue && callback) {
          const index = queue.indexOf(callback);
          if (index !== -1) {
            queue.splice(index, 1);
            if (queue.length === 0) {
              this.pendingResponse.delete(expectedEvent);
            }
          }
        }
        reject(new Error(`Timeout waiting for PB event ${expectedEvent}`));
      }, timeoutMs);

      callback = (msg: CommandInfo) => {
        clearTimeout(timer);
        resolve(msg);
      };

      const queue = this.pendingResponse.get(expectedEvent);
      if (queue) {
        queue.push(callback);
      } else {
        this.pendingResponse.set(expectedEvent, [callback]);
      }

      this.transport.send({
        command,
        value1: params.value1 ?? 0,
        value2: params.value2 ?? 0,
        data:   params.data,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Internal: variable fetching
  // -------------------------------------------------------------------------

  private async fetchGlobals(): Promise<DebugProtocol.Variable[]> {
    this.log('fetchGlobals: requesting global names...');
    const namesMsg = await this.sendAndWait(
      PBCommand.GetGlobalNames, PBEvent.GlobalNames, {}, 3_000,
    );
    this.log(`fetchGlobals: got names response, data length=${namesMsg.data.length}`);
    
    if (this.secureTrace) {
      const namesHex = namesMsg.data.toString('hex');
      this.log(`fetchGlobals: raw names data (hex): ${namesHex.substring(0, 200)}...`);
    }
    
    // Try to decode first few bytes manually (only if data is long enough)
    if (namesMsg.data.length >= 4) {
      const count = namesMsg.data.readUInt32LE(0);
      this.log(`fetchGlobals: name count from first 4 bytes: ${count}`);
    } else {
      this.log(`fetchGlobals: data too short for count read (length=${namesMsg.data.length})`);
    }
    
    const names = parseNames(namesMsg.data);
    this.log(`fetchGlobals: parsed ${names.length} names`);
    if (names.length === 0) return [];

    this.log('fetchGlobals: requesting global values...');
    const valsMsg = await this.sendAndWait(
      PBCommand.GetGlobals, PBEvent.Globals, {}, 3_000,
    );
    this.log(`fetchGlobals: got values response, data length=${valsMsg.data.length}, is64bit=${this.is64bit}`);
    
    if (this.secureTrace) {
      const hexPreview = valsMsg.data.slice(0, Math.min(32, valsMsg.data.length)).toString('hex');
      this.log(`fetchGlobals: values data hex (first 32 bytes): ${hexPreview}`);
    }
    
    // Globals values format: [1B rawType][value data] per variable, sequential.
    // Use decodePBValue (same decoder as locals) to correctly handle strings, etc.
    const result: DebugProtocol.Variable[] = [];
    let offset = 0;
    for (const { name } of names) {
      if (offset >= valsMsg.data.length) break;

      const rawType = valsMsg.data.readUInt8(offset);
      offset += 1;

      const decoded = this.decodePBValue(rawType, valsMsg.data, offset);
      if (decoded.bytesRead <= 0 && decoded.typeName !== 'Structure') break;
      offset += decoded.bytesRead;

      this.log(`fetchGlobals:   ${name} (${decoded.typeName}) = ${this.secureTrace ? decoded.value : '<redacted>'}`);
      result.push({
        name,
        value: decoded.value,
        type: decoded.typeName,
        variablesReference: 0,
      });
    }

    return result;
  }

  private async fetchLocals(procedureIndex: number): Promise<DebugProtocol.Variable[]> {
    this.log(`fetchLocals: requesting frame ${procedureIndex}...`);
    const localsMsg = await this.sendAndWait(
      PBCommand.GetLocals, PBEvent.Locals, { value1: procedureIndex }, 3_000,
    );

    let locals = this.parseLocals(localsMsg.data, localsMsg.value2);
    this.log(`fetchLocals: parsed ${locals.length} locals for frame ${procedureIndex}`);

    // Frame id from DAP may not always match PB procedure index; fallback to current frame (0).
    if (locals.length === 0 && procedureIndex !== 0) {
      this.log('fetchLocals: empty result, retrying with frame 0');
      const fallbackMsg = await this.sendAndWait(
        PBCommand.GetLocals, PBEvent.Locals, { value1: 0 }, 3_000,
      );
      locals = this.parseLocals(fallbackMsg.data, fallbackMsg.value2);
      this.log(`fetchLocals: fallback parsed ${locals.length} locals`);
    }

    return locals;
  }

  private parseLocals(data: Buffer, count: number): DebugProtocol.Variable[] {
    const result: DebugProtocol.Variable[] = [];
    let offset = 0;

    for (let i = 0; i < count; i++) {
      if (offset + 7 > data.length) break;

      const rawType = data.readUInt8(offset);
      offset += 1;
      // dynamic type currently unused, but required in payload layout
      offset += 1;
      // scope currently unused for DAP rendering
      offset += 1;
      // sublevel currently unused for DAP rendering
      offset += 4;

      const nameEnd = data.indexOf(0, offset);
      if (nameEnd === -1) break;
      const name = data.slice(offset, nameEnd).toString('ascii');
      offset = nameEnd + 1;

      const decoded = this.decodePBValue(rawType, data, offset);
      if (decoded.bytesRead < 0 || offset + decoded.bytesRead > data.length) break;
      if (decoded.bytesRead === 0 && decoded.typeName !== 'Structure') break;
      offset += decoded.bytesRead;

      if (!name) continue;
      result.push({
        name,
        type: decoded.typeName,
        value: decoded.value,
        variablesReference: 0,
      });
    }

    return result;
  }

  private decodePBValue(rawType: number, data: Buffer, offset: number): {
    value: string;
    typeName: string;
    bytesRead: number;
  } {
    const baseType = rawType & PB_TYPE_MASK;
    const isPointer = (rawType & PB_POINTER_MASK) !== 0;
    const intSize = this.is64bit ? 8 : 4;

    const readUtf16Z = (): { text: string; bytes: number } => {
      let end = offset;
      while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2;
      const bytes = Math.min(data.length - offset, end + 2 - offset);
      return { text: data.slice(offset, end).toString('utf16le'), bytes };
    };

    const readAsciiZ = (): { text: string; bytes: number } => {
      const end = data.indexOf(0, offset);
      if (end === -1) {
        return { text: data.slice(offset).toString('ascii'), bytes: data.length - offset };
      }
      return { text: data.slice(offset, end).toString('ascii'), bytes: end + 1 - offset };
    };

    if (isPointer) {
      if (offset + intSize > data.length) return { value: '<invalid>', typeName: 'Pointer', bytesRead: 0 };
      const value = this.is64bit
        ? '0x' + data.readBigUInt64LE(offset).toString(16).toUpperCase()
        : '0x' + data.readUInt32LE(offset).toString(16).toUpperCase();
      return { value, typeName: 'Pointer', bytesRead: intSize };
    }

    if (baseType === 21) {
      if (offset + intSize > data.length) return { value: '<invalid>', typeName: 'Integer', bytesRead: 0 };
      const value = this.is64bit
        ? data.readBigInt64LE(offset).toString()
        : data.readInt32LE(offset).toString();
      return { value, typeName: 'Integer', bytesRead: intSize };
    }

    switch (baseType) {
      case 1:
        if (offset + 1 > data.length) return { value: '<invalid>', typeName: 'Byte', bytesRead: 0 };
        return { value: String(data.readInt8(offset)), typeName: 'Byte', bytesRead: 1 };
      case 3:
        if (offset + 2 > data.length) return { value: '<invalid>', typeName: 'Word', bytesRead: 0 };
        return { value: String(data.readInt16LE(offset)), typeName: 'Word', bytesRead: 2 };
      case 5:
        if (offset + 4 > data.length) return { value: '<invalid>', typeName: 'Long', bytesRead: 0 };
        return { value: String(data.readInt32LE(offset)), typeName: 'Long', bytesRead: 4 };
      case 7:
        return { value: '<structure>', typeName: 'Structure', bytesRead: 0 };
      case 8:
      case 10: {
        const s = readUtf16Z();
        return { value: s.text, typeName: baseType === 8 ? 'String' : 'FixedString', bytesRead: s.bytes };
      }
      case 9:
        if (offset + 4 > data.length) return { value: '<invalid>', typeName: 'Float', bytesRead: 0 };
        return { value: data.readFloatLE(offset).toString(), typeName: 'Float', bytesRead: 4 };
      case 11:
        if (offset + 4 > data.length) return { value: '<invalid>', typeName: 'Character', bytesRead: 0 };
        return { value: String(data.readInt32LE(offset)), typeName: 'Character', bytesRead: 4 };
      case 12:
        if (offset + 8 > data.length) return { value: '<invalid>', typeName: 'Double', bytesRead: 0 };
        return { value: data.readDoubleLE(offset).toString(), typeName: 'Double', bytesRead: 8 };
      case 13:
        if (offset + 8 > data.length) return { value: '<invalid>', typeName: 'Quad', bytesRead: 0 };
        return { value: data.readBigInt64LE(offset).toString(), typeName: 'Quad', bytesRead: 8 };
      case 14: {
        if (offset + intSize * 2 > data.length) return { value: '<invalid>', typeName: 'List', bytesRead: 0 };
        const size = this.is64bit ? data.readBigInt64LE(offset) : BigInt(data.readInt32LE(offset));
        const current = this.is64bit ? data.readBigInt64LE(offset + intSize) : BigInt(data.readInt32LE(offset + intSize));
        return { value: `size=${size} current=${current}`, typeName: 'List', bytesRead: intSize * 2 };
      }
      case 15: {
        const dims = readAsciiZ();
        return { value: dims.text, typeName: 'Array', bytesRead: dims.bytes };
      }
      case 22: {
        if (offset + intSize + 1 > data.length) return { value: '<invalid>', typeName: 'Map', bytesRead: 0 };
        const size = this.is64bit ? data.readBigInt64LE(offset) : BigInt(data.readInt32LE(offset));
        const isCurrent = data.readUInt8(offset + intSize) !== 0;
        if (!isCurrent) {
          return { value: `size=${size}`, typeName: 'Map', bytesRead: intSize + 1 };
        }
        const current = (() => {
          const start = offset + intSize + 1;
          let end = start;
          while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2;
          return { text: data.slice(start, end).toString('utf16le'), bytes: end + 2 - start };
        })();
        return { value: `size=${size} current=${current.text}`, typeName: 'Map', bytesRead: intSize + 1 + current.bytes };
      }
      case 24:
        if (offset + 1 > data.length) return { value: '<invalid>', typeName: 'Ascii', bytesRead: 0 };
        return { value: String(data.readInt8(offset)), typeName: 'Ascii', bytesRead: 1 };
      case 25:
        if (offset + 2 > data.length) return { value: '<invalid>', typeName: 'Unicode', bytesRead: 0 };
        return { value: String(data.readInt16LE(offset)), typeName: 'Unicode', bytesRead: 2 };
      default:
        return { value: `<type ${baseType}>`, typeName: `Type${baseType}`, bytesRead: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Internal: breakpoint management
  // -------------------------------------------------------------------------

  private flushPendingBreakpoints(): void {
    this.log(`Flushing pending breakpoints: ${this.pendingBreakpoints.size} files`);
    for (const [filePath, lines] of this.pendingBreakpoints) {
      this.log(`  Sending breakpoints for ${filePath}: lines ${lines.join(', ')}`);
      this.sendBreakpointsForFile(filePath, lines);
    }
  }

  private sendBreakpointsForFile(filePath: string, lines: number[]): void {
    if (!this.transport) return;
    const fileNum = this.resolveFileNum(filePath);
    if (fileNum === undefined) {
      this.log(`  Skipping breakpoints for unmapped source file: ${filePath}`);
      this.log(`  Current file map: ${JSON.stringify([...this.fileNumToPath])}`);
      return;
    }

    this.log(`  Resolved fileNum ${fileNum} for ${filePath}`);
    this.log(`  Current file map: ${JSON.stringify([...this.fileNumToPath])}`);

    // Clear existing breakpoints for this file first
    this.log(`  Clearing existing breakpoints for fileNum ${fileNum}`);
    try {
      this.transport.send({
        command: PBCommand.BreakPoint,
        value1: BreakPointAction.Clear,
        value2: makeDebuggerLine(fileNum, 0),
      });
      this.log(`  Clear command sent successfully`);
    } catch (err: any) {
      this.log(`  Error clearing breakpoints: ${err.message}`);
    }

    this.log(`  Sending ${lines.length} breakpoints`);

    // Add the new set
    for (const line of lines) {
      const packedLine = makeDebuggerLine(fileNum, line - 1);
      this.log(`    Adding breakpoint at line ${line} (packed=${packedLine}, fileNum=${fileNum})`);
      try {
        this.transport.send({
          command: PBCommand.BreakPoint,
          value1:  BreakPointAction.Add,
          value2:  packedLine,
        });
        this.log(`    Breakpoint sent successfully`);
      } catch (err: any) {
        this.log(`    Error sending breakpoint: ${err.message}`);
      }
    }
  }

  private resolveFileNum(filePath: string): number | undefined {
    const normalizedPath = this.normalizePath(filePath);
    for (const [num, p] of this.fileNumToPath) {
      if (this.normalizePath(p) === normalizedPath) return num;
    }
    return undefined;
  }

  private normalizePath(filePath: string): string {
    if (!filePath) return '';
    const normalized = path.normalize(filePath);
    const resolved = path.resolve(normalized);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  // -------------------------------------------------------------------------
  // Internal: history / call-stack parsing
  // -------------------------------------------------------------------------

  private parseHistory(data: Buffer): Array<{ packedLine: number; procedureName: string }> {
    const frames: Array<{ packedLine: number; procedureName: string }> = [];
    let offset = 0;

    while (offset + 4 <= data.length) {
      const packedLine = data.readUInt32LE(offset);
      offset += 4;

      // Find null terminator (UTF-16LE \0\0)
      let end = offset;
      while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) {
        end += 2;
      }
      const procedureName = data.slice(offset, end).toString('utf16le');
      offset = end + 2;

      frames.push({ packedLine, procedureName });
    }

    return frames;
  }

  private inferFrameName(sourcePath: string, line1: number): string {
    if (!sourcePath) return '[main]';
    try {
      const ranges = this.getProcedureRanges(sourcePath);
      for (const range of ranges) {
        if (line1 >= range.start && line1 <= range.end) {
          return this.formatQualifiedProcedureName(range.name, range.moduleName);
        }
      }
    } catch (err) {
      this.log(`inferFrameName failed for ${sourcePath}:${line1} - ${(err as Error).message}`);
    }
    return '[main]';
  }

  private formatQualifiedProcedureName(name: string, moduleName?: string): string {
    const trimmedName = name.trim();
    if (!trimmedName) return '[main]';
    if (!moduleName || trimmedName.includes('::')) {
      return `${trimmedName}()`;
    }
    return `${moduleName}::${trimmedName}()`;
  }

  private parseHistoryProcedureName(name: string): string | null {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)?)\s*(?:\(|$)/.exec(trimmedName);
    if (!match?.[1]) return null;
    return `${match[1]}()`;
  }

  private buildStackFrameName(inferredName: string, historyName: string | null): string {
    if (!historyName) return inferredName;
    if (inferredName === '[main]') return `[main] -> ${historyName}`;
    return inferredName;
  }

  private getProcedureRanges(sourcePath: string): ProcedureRange[] {
    const key = this.normalizePath(sourcePath);
    const cached = this.procedureRangesCache.get(key);
    if (cached) return cached;

    const workspaceRoot = this.launchArgs?.program
      ? path.dirname(path.resolve(this.launchArgs.program))
      : process.cwd();
    const absoluteSourcePath = path.resolve(sourcePath);
    const relativeToWorkspace = path.relative(workspaceRoot, absoluteSourcePath);
    if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
      this.log(`Skipping procedure range parse outside workspace: ${absoluteSourcePath}`);
      this.procedureRangesCache.set(key, []);
      return [];
    }

    const content = fs.readFileSync(absoluteSourcePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const procRegex = /^\s*Procedure(?:C|CDLL|DLL)?(?:\.[A-Za-z0-9_]+)?\s+([^\s(]+)/i;
    const endProcRegex = /^\s*EndProcedure\b/i;
    const moduleRegex = /^\s*Module\s+([^\s;]+)/i;
    const endModuleRegex = /^\s*EndModule\b/i;
    const ranges: ProcedureRange[] = [];
    const moduleStack: string[] = [];

    let current: { start: number; name: string; moduleName?: string } | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/;.*$/, '');
      if (!current) {
        const moduleMatch = moduleRegex.exec(line);
        if (moduleMatch?.[1]) {
          moduleStack.push(moduleMatch[1]);
          continue;
        }

        if (endModuleRegex.test(line)) {
          if (moduleStack.length > 0) moduleStack.pop();
          continue;
        }

        const match = procRegex.exec(line);
        if (match?.[1]) {
          current = {
            start: i + 1,
            name: match[1],
            moduleName: moduleStack[moduleStack.length - 1],
          };
        }
        continue;
      }

      if (endProcRegex.test(line)) {
        ranges.push({
          start: current.start,
          end: i + 1,
          name: current.name,
          moduleName: current.moduleName,
        });
        current = null;
      }
    }

    if (current) {
      ranges.push({
        start: current.start,
        end: lines.length,
        name: current.name,
        moduleName: current.moduleName,
      });
    }

    this.procedureRangesCache.set(key, ranges);
    return ranges;
  }

  // -------------------------------------------------------------------------
  // Internal: cleanup & logging
  // -------------------------------------------------------------------------

  private cleanup(terminateDebuggee = true): void {
    if (!this.state.isTerminated()) {
      this.state.transition('terminated');
      if (terminateDebuggee) {
        try { this.transport?.send({ command: PBCommand.Kill }); } catch {}
      }
    }
    this.transport?.close();
    this.transport = null;
    this.communicationString = null;
    if (terminateDebuggee) {
      try { this.debugProc?.kill(); } catch {}
    }
    this.debugProc = null;
  }

  private safeErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (this.trace || this.secureTrace) {
      return raw;
    }

    // Keep common user-actionable diagnostics while avoiding path/env leakage.
    if (/not found|enoent|invalid|timeout|failed/i.test(raw)) {
      return raw;
    }
    return 'Launch failed. Enable trace for details.';
  }

  private log(msg: string): void {
    if (!this.trace) {
      return;
    }
    process.stderr.write(`[PBDebugSession] ${msg}\n`);
    this.sendEvent(new OutputEvent(`[Debug] ${msg}\n`, 'console'));
  }
}
