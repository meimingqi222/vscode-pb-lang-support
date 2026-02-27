# PureBasic Debugger Configuration

This document describes all available configuration options for the PureBasic debugger in VSCode.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [Transport Modes](#transport-modes)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Quick Start

Add a debug configuration to your `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "purebasic",
      "request": "launch",
      "name": "Debug PureBasic",
      "program": "${file}",
      "stopOnEntry": false
    }
  ]
}
```

## Configuration Options

### Required Parameters

#### `program`
- **Type**: `string`
- **Description**: Absolute path to the PureBasic source file (.pb) to debug
- **Default**: `"${file}"` (current active file)
- **Example**: `"${workspaceFolder}/src/main.pb"`

### Optional Parameters

#### `compiler`
- **Type**: `string`
- **Description**: Path to PureBasic compiler executable
- **Default**: `"pbcompiler"` (searches in PATH)
- **Platform-specific**:
  - Windows: `pbcompiler.exe`
  - Linux/macOS: `pbcompiler`
- **Example**: `"/opt/purebasic/compilers/pbcompiler"`

#### `stopOnEntry`
- **Type**: `boolean`
- **Description**: Automatically stop at program entry point on launch
- **Default**: `false`
- **Note**: When `false`, the debugger only stops at breakpoints you set

#### `transport`
- **Type**: `string`
- **Enum**: `"auto"`, `"pipe"`, `"network"`, `"fifo"`, `"native"`
- **Description**: Communication method between debugger and debuggee
- **Default**: `"auto"`
- **Platform Behavior**:
  | Mode | Windows | Linux | macOS |
  |------|---------|-------|-------|
  | `auto` | Named Pipe ✓ | FIFO¹ | FIFO ✓ |
  | `pipe` | Named Pipe | ? | ? |
  | `fifo` | ? | FIFO¹ | FIFO¹ |
  | `network` | TCP | TCP | TCP |
  | `native` | Native API | ? | ? |

  **Legend**: ✓ = Verified working, ¹ = Expected to work (not yet verified), ? = Unknown/Not tested

#### `debugHost`
- **Type**: `string`
- **Description**: Host address for network transport mode
- **Default**: `"127.0.0.1"`
- **Requirement**: Only used when `transport` is `"network"`

#### `debugPort`
- **Type**: `number` (0-65535)
- **Description**: Port for network transport mode
- **Default**: `0` (random free port)
- **Requirement**: Only used when `transport` is `"network"`

#### `debugPassword`
- **Type**: `string`
- **Description**: Password for PureBasic NetworkClient mode
- **Default**: none
- **Requirement**: Only used when `transport` is `"network"`

#### `trace`
- **Type**: `boolean`
- **Description**: Enable verbose adapter trace logging
- **Default**: `false`
- **Output**: Written to stderr/debug console

#### `secureTrace`
- **Type**: `boolean`
- **Description**: Include debuggee data in trace logs (may contain sensitive info)
- **Default**: `false`
- **Note**: Only effective when `trace` is `true`

#### `compilerArgs`
- **Type**: `string[]`
- **Description**: Additional command-line arguments passed to pbcompiler
- **Default**: `[]`
- **Example**: `["/EXE", "myapp.exe"]`

## Transport Modes

### Auto Mode (Recommended)
Automatically selects the best transport for your platform:
- **Windows**: Named pipes (most reliable)
- **Linux/macOS**: FIFO (named pipes)

```json
{
  "transport": "auto"
}
```

### Pipe Mode (Windows Only)
Uses Windows named pipes for communication.

```json
{
  "transport": "pipe"
}
```

### FIFO Mode (Linux/macOS Only)
Uses Unix named pipes (FIFOs) for communication.

```json
{
  "transport": "fifo"
}
```

### Network Mode (All Platforms)
Uses TCP sockets. Useful for remote debugging or when other transports fail.

```json
{
  "transport": "network",
  "debugHost": "127.0.0.1",
  "debugPort": 5678
}
```

### Native Mode (Windows Only)
Uses PureBasic's native debugger API. Most compatible with IDE features.

```json
{
  "transport": "native"
}
```

## Examples

### Basic Debugging
```json
{
  "type": "purebasic",
  "request": "launch",
  "name": "Debug Current File",
  "program": "${file}",
  "stopOnEntry": false
}
```

### Debug with Specific Compiler
```json
{
  "type": "purebasic",
  "request": "launch",
  "name": "Debug with Custom Compiler",
  "program": "${workspaceFolder}/main.pb",
  "compiler": "/usr/local/bin/pbcompiler",
  "stopOnEntry": false
}
```

### Network Debugging
```json
{
  "type": "purebasic",
  "request": "launch",
  "name": "Debug via Network",
  "program": "${file}",
  "transport": "network",
  "debugHost": "192.168.1.100",
  "debugPort": 5678,
  "stopOnEntry": false
}
```

### Verbose Logging for Troubleshooting
```json
{
  "type": "purebasic",
  "request": "launch",
  "name": "Debug with Logging",
  "program": "${file}",
  "trace": true,
  "secureTrace": false,
  "stopOnEntry": false
}
```

### macOS/Linux with FIFO
```json
{
  "type": "purebasic",
  "request": "launch",
  "name": "Debug with FIFO",
  "program": "${file}",
  "transport": "fifo",
  "stopOnEntry": false
}
```

## Troubleshooting

### "Timeout waiting for connection"
- Check that PureBasic compiler is installed and in PATH
- Try switching transport mode (e.g., `network` instead of `auto`)
- Enable `trace: true` to see detailed connection logs

### Breakpoints not hitting
- Ensure `stopOnEntry` is `false` if you only want to stop at breakpoints
- Check that line numbers match compiled code
- Try disabling optimizations in compiler settings

### "Failed to create FIFO/pipe"
- On Linux/macOS: Check write permissions to `/tmp`
- On Windows: Ensure no antivirus is blocking named pipes
- Try `network` transport mode as fallback

### Transport Compatibility

| Issue | Solution |
|-------|----------|
| Windows pipe creation fails | Use `transport: "network"` |
| macOS FIFO permission denied | Check `/tmp` permissions or use `network` |
| Linux connection refused | Verify pbcompiler version supports debugging |
| Remote debugging | Use `transport: "network"` with specific host/port |

## Environment Variables

The debugger sets these environment variables for the debuggee:

- `PB_DEBUGGER_Communication`: Transport-specific connection string
- `PB_DEBUGGER_Options`: Debugger options (unicode, callOnStart, etc.)
- `PUREBASIC_HOME`: PureBasic installation directory (auto-detected if not set)

## See Also

- [Debug Adapter Plan](./debug-adapter-plan.md) - Technical implementation details
- [VSCode Debugging Documentation](https://code.visualstudio.com/docs/editor/debugging)

