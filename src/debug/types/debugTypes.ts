import { DebugProtocol } from '@vscode/debugprotocol';

export type LaunchTransportMode = 'auto' | 'pipe' | 'network' | 'fifo' | 'native';

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** Path to the .pb source file to debug. */
  program: string;
  /** Path to PureBasic compiler executable (pbcompiler/pbcompiler.exe). */
  compiler?: string;
  /** Stop at the first executable line when launching. Default: true. */
  stopOnEntry?: boolean;
  /** Enable verbose trace logging from the adapter. Default: false. */
  trace?: boolean;
  /** Enable full-value trace logs (may include debuggee data). Default: false. */
  secureTrace?: boolean;
  /** Extra command-line arguments to pass to pbcompiler. */
  compilerArgs?: string[];
  /** Debug transport mode. auto: win32->pipe, macOS/linux->fifo. */
  transport?: LaunchTransportMode;
  /** Network debug host used when transport resolves to network. */
  debugHost?: string;
  /** Network debug port used when transport resolves to network. 0 means random port. */
  debugPort?: number;
  /** Optional network debug password for PureBasic NetworkClient mode. */
  debugPassword?: string;
}

export interface CommandInfo {
  command: number;
  dataSize: number;
  value1: number;
  value2: number;
  timestamp: number;
  data: Buffer;
}

export interface PBVariable {
  name: string;
  typeId: number;
  value: string;
}

export interface PBStackFrame {
  lineNumber: number;
  procedureName: string;
}

export interface CompileResult {
  executablePath: string;
}
