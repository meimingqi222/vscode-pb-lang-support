/**
 * PureBasic Debugger Protocol — command and event constants.
 *
 * TWO separate Enumeration blocks (both starting at 0), confirmed from
 * fantaisie-software/purebasic (devel branch), PureBasicDebugger/DebuggerCommon.pb
 *
 *  PBCommand — commands sent from the IDE to the program, over PipeB (debugger→program)
 *  PBEvent   — events sent from the program to the IDE, over PipeA (program→debugger)
 */

/** Commands sent from the debugger (IDE) to the program (EXE), over PipeB. */
export const enum PBCommand {
  Stop               = 0,
  Step               = 1,
  Run                = 2,
  BreakPoint         = 3,
  GetGlobalNames     = 9,
  GetGlobals         = 10,
  GetLocals          = 11,
  GetHistory         = 16,
  EvaluateExpression = 33,
  EvaluateExpressionWithStruct = 34,
  Kill               = 37,
}

/** Events sent from the program (EXE) to the debugger (IDE), over PipeA. */
export const enum PBEvent {
  Init        = 0,   // Handshake: Value1=numFiles, Value2=protocol version (12)
  End         = 1,   // Program has ended
  ExeMode     = 2,   // Executable mode flags (OS/arch/Unicode/etc.)
  Stopped     = 3,   // Stopped: Value1=packed file+line, Value2=StopReason
  Continued   = 4,   // Program resumed after stop
  Debug       = 5,   // Debug output
  DebugDouble = 6,   // Debug output for double values
  DebugQuad   = 7,   // Debug output for quad/int64 values
  Error       = 8,   // Runtime error (UTF-16LE description in data)
  GlobalNames = 13,  // Response to GetGlobalNames
  Globals     = 14,  // Response to GetGlobals
  Locals      = 15,  // Response to GetLocals
  History     = 22,  // Response to GetHistory
  Expression  = 36,  // Response to EvaluateExpression
}

/** Protocol version in COMMAND_Init.Value2. */
export const PB_PROTOCOL_VERSION = 12;

/**
 * Stop reason codes in COMMAND_Stopped (Value2 field).
 * Value1 encodes file+line via makeDebuggerLine().
 */
export const enum StopReason {
  StepComplete   = 0,  // Step completed (into/over/out)
  CallDebugger   = 3,  // CallDebugger keyword or CallDebuggerOnStart entry stop
  BeforeEnd      = 5,  // CallDebuggerOnEnd
  Breakpoint     = 7,  // Breakpoint hit
  UserStop       = 8,  // User clicked Stop/Pause
  DataBreakpoint = 9,  // Data breakpoint triggered
}

/** Step type for COMMAND_Step (value placed in value2). */
export const enum StepType {
  Into = 0,
  Over = 1,
  Out  = 2,
}

/** BreakPoint action for COMMAND_BreakPoint (value placed in value1). */
export const enum BreakPointAction {
  Add    = 1,
  Remove = 2,
  Clear  = 3,
}

/**
 * Pack a file index and 0-based line number into a single uint32 for
 * COMMAND_BreakPoint.Value2 and COMMAND_Stopped.Value1.
 *
 *   bits [31:20] = file index (12 bits, 0 = main source file)
 *   bits [19:0]  = line number, 0-based (20 bits)
 *
 * (#DEBUGGER_DebuggerLineFileOffset = 20 in DebuggerCommon.pb)
 */
export function makeDebuggerLine(fileIndex: number, line0: number): number {
  return ((fileIndex & 0xFFF) << 20) | (line0 & 0xFFFFF);
}

/** Extract file index from a packed debugger-line value. */
export function debuggerLineFile(packed: number): number {
  return (packed >> 20) & 0xFFF;
}

/** Extract 0-based line number from a packed debugger-line value. */
export function debuggerLineRow0(packed: number): number {
  return packed & 0xFFFFF;
}
