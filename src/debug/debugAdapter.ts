import { DebugSession } from '@vscode/debugadapter';
import { PBDebugSession } from './session/PBDebugSession';

// Run the debug adapter as a stdio server.
// VSCode spawns this file as a child process and communicates via stdin/stdout.
DebugSession.run(PBDebugSession);
