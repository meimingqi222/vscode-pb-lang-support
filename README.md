# PureBasic Language Support for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Visual Studio Code extension that provides comprehensive [PureBasic](https://www.purebasic.com/) language support including **IntelliSense**, **Debugging**, and **Code Navigation**.

## What's New: VSCode Debugger Support

This extension now includes a full-featured debugger for PureBasic. Debug your code directly in VSCode with:

- **Breakpoints** - Set breakpoints in your PureBasic code
- **Step Debugging** - Step Over, Step Into, Step Out
- **Variable Inspection** - View local and global variables
- **Call Stack** - Navigate through the call stack

### Quick Debug Setup

1. Open your `.pb` file in VSCode
2. Press `F5` or go to Run → Start Debugging
3. The debugger will automatically compile and run your program

Or create a `.vscode/launch.json` configuration:

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

**[Complete Debugger Documentation →](./docs/debugger-configuration.md)**

## Features

### Code Editing
| Feature | Description |
|---------|-------------|
| Syntax Highlighting | Full support for keywords, strings, comments, numbers |
| Code Folding | Fold procedures, loops, and conditionals |
| Bracket Matching | Automatic matching of brackets and quotes |
| Auto Formatting | Format code with `Shift+Alt+F` |

### IntelliSense
| Feature | Description | Shortcut |
|---------|-------------|----------|
| Auto Completion | Keywords, functions, procedures, variables | `Ctrl+Space` |
| Signature Help | Function parameter hints | Hover / Type `(` |
| Hover Information | Type info and documentation | Hover |
| Document Outline | Hierarchical symbol view | `Ctrl+Shift+O` |

### Navigation
| Feature | Description | Shortcut |
|---------|-------------|----------|
| Go to Definition | Jump to symbol definitions | `F12` |
| Find All References | Find symbol usages across files | `Shift+F12` |
| Rename Symbol | Rename across files | `F2` |

### Code Quality
| Feature | Description |
|---------|-------------|
| Error Diagnostics | Real-time syntax checking |
| Code Actions | Quick fixes and refactorings |

### PureBasic Language Support
- **Modules**: `Module::Function` syntax completion and navigation
- **Structures**: Member access with `\` completion
- **Constants**: `#CONSTANT` definitions with auto-completion
- **Arrays/Lists/Maps**: Specialized IntelliSense for collection types
- **Windows API**: Comprehensive API function support
- **Graphics/Game**: Sprite, Screen, and 3D functions

## Installation

Search for **"PureBasic Language Support"** in the VSCode Extensions marketplace (`Ctrl+Shift+X`) and click Install.

## Usage

### Writing Code
1. Open any `.pb` or `.pbi` file
2. Start typing to see auto-completion suggestions
3. Hover over functions to see documentation
4. Press `F12` to jump to definitions

### Debugging
1. Set breakpoints by clicking in the gutter
2. Press `F5` to start debugging
3. Use the Debug toolbar to Step Over (`F10`), Step Into (`F11`), or Continue (`F5`)
4. Inspect variables in the Variables panel

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `F5` | Start Debugging |
| `F10` | Step Over |
| `F11` | Step Into |
| `Shift+F11` | Step Out |
| `F12` | Go to Definition |
| `Shift+F12` | Find All References |
| `F2` | Rename Symbol |
| `Ctrl+Space` | Trigger Suggestions |
| `Shift+Alt+F` | Format Document |

## Configuration

### Debugger Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `program` | string | `"${file}"` | Path to .pb file to debug |
| `stopOnEntry` | boolean | `false` | Stop at program start |
| `transport` | string | `"auto"` | Transport: `auto`, `pipe`, `fifo`, `network` |
| `compiler` | string | `"pbcompiler"` | Path to PureBasic compiler |
| `trace` | boolean | `false` | Enable verbose logging |

### Extension Settings

Access settings: `Ctrl+,` → Search "PureBasic"

### Basic Settings
```json
{
  "purebasic.maxNumberOfProblems": 100,
  "purebasic.enableValidation": true,
  "purebasic.enableCompletion": true,
  "purebasic.validationDelay": 500
}
```

### Formatting
```json
{
  "purebasic.formatting.enabled": true,
  "purebasic.formatting.indentSize": 4,
  "purebasic.formatting.tabSize": 4,
  "purebasic.formatting.insertSpaces": true
}
```

### Performance
```json
{
  "purebasic.performance.enableIncrementalParsing": true,
  "purebasic.performance.maxFileSize": 1048576,
  "purebasic.symbols.cacheEnabled": true
}
```

## Commands & Shortcuts

### Commands (Ctrl+Shift+P)
| Command | Description |
|---------|-------------|
| **PureBasic: Show Diagnostics** | Focus Problems panel |
| **PureBasic: Restart Language Server** | Restart LSP server |
| **PureBasic: Clear Symbol Cache** | Clear cached symbols |
| **PureBasic: Format Document** | Format current file |
| **PureBasic: Find Symbols** | Search workspace symbols |

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `F12` | Go to Definition |
| `Shift+F12` | Find All References |
| `Ctrl+Shift+O` | Go to Symbol in File |
| `Ctrl+Shift+M` | Show Problems |
| `F2` | Rename Symbol |
| `Shift+Alt+F` | Format Document |
| `Ctrl+Space` | Trigger Suggestions |

## Example

```purebasic
; Simple PureBasic example with IntelliSense support
Procedure.i AddNumbers(a.i, b.i)
    ProcedureReturn a + b
EndProcedure

result = AddNumbers(5, 10)  ; Hover for signature help

; Structure with member completion
Structure Point
  x.i
  y.i
EndStructure

define point.Point
point\x = 100  ; Type \ for member suggestions
point\y = 200

; Debug your code with breakpoints
Debug result  ; Set a breakpoint here
```

## Changelog

### 0.0.4 - VSCode Debugger Support (Current)

The major new feature in this release is **full VSCode debugger integration** for PureBasic:

- **Debug Adapter**: Native VSCode debugging experience
- **Breakpoints**: Set breakpoints directly in your code
- **Step Debugging**: Step Over, Step Into, Step Out
- **Variable Inspection**: View local and global variables in the Debug panel
- **Call Stack**: Navigate through procedure calls

### Previous Versions

- IntelliSense and code completion
- Go to Definition / Find References
- Syntax highlighting and code folding
- Document formatting

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Setup

```bash
# Clone repository
git clone https://github.com/meimingqi222/vscode-pb-lang-support.git
cd vscode-pb-lang-support

# Install dependencies
npm install

# Compile and build
npm run compile
npm run webpack

# Run tests
npm run test

# Start debugging in VSCode
# Press F5 to launch extension host
```

### Project Structure

```
vscode-pb-lang-support/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── server/                # Language Server Protocol (LSP) implementation
│   │   ├── providers/         # Language feature providers
│   │   ├── validation/        # Code validation
│   │   └── symbols/           # Symbol management and caching
│   └── debug/                 # Debug Adapter Protocol (DAP) implementation
│       ├── transport/         # Transport layer (Pipe, FIFO, Network)
│       ├── compiler/          # Compiler integration
│       └── session/           # Debug session management
├── docs/                      # Documentation
│   ├── debugger-configuration.md
│   └── debug-adapter-plan.md
├── test/                      # Test files
└── syntaxes/                  # TextMate syntax definitions
```

### Architecture

- **Language Server**: Provides IntelliSense, diagnostics, and code navigation via LSP
- **Debug Adapter**: Enables debugging via DAP with multiple transport options
- **Symbol Cache**: Efficient symbol indexing for large projects
- **Transport Layer**: Abstracted communication (Named Pipes, FIFO, TCP)

## License

MIT License

---

**PureBasic** is a registered trademark of Fantaisie Software. This extension is not affiliated with or endorsed by Fantaisie Software.