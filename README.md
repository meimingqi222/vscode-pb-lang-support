# PureBasic Language Support for VSCode

A Visual Studio Code extension that provides comprehensive PureBasic language support.

## Features

### Basic Language Support
- ✅ **Syntax Highlighting**: Support for PureBasic keywords, strings, comments, numbers, etc.
- ✅ **Code Folding**: Support for folding procedures, functions, loops, and conditional statements
- ✅ **Bracket Matching**: Automatic matching of brackets and quotes
- ✅ **Comment Support**: Line comment (;) support

### Intelligent Language Features
- ✅ **Auto Completion**: Keywords, functions, variables, and procedure name completion
- ✅ **Go to Definition**: Jump to function/procedure definition locations
- ✅ **Find All References**: Show all usage locations of variables/functions
- ✅ **Hover Information**: Display function signatures, variable types, and other information
- ✅ **Error Diagnostics**: Real-time syntax checking and error highlighting
- ✅ **Rename Symbol**: Safely rename variables, functions, etc.
- ✅ **Code Formatting**: Automatic code style formatting

### Supported PureBasic Features
- PureBasic keywords (Procedure, EndProcedure, If, EndIf, For, Next, etc.)
- Data types (Integer, String, Float, etc.)
- Built-in functions (OpenWindow(), CreateGadgetList(), etc.)
- Procedure and function definitions
- Structures and arrays
- API calls and library references

## Installation

### Development Version
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press F5 in VSCode to start debugging

### Release Version
Search for "PureBasic Language Support" in the VSCode Extension Marketplace and install

## Usage

1. Create or open a `.pb` or `.pbi` file
2. Start writing PureBasic code
3. Enjoy intelligent code completion, syntax highlighting, and other features

## Example Code

```purebasic
; Simple PureBasic example
Procedure.i AddNumbers(a.i, b.i)
    ProcedureReturn a + b
EndProcedure

If OpenWindow(0, 0, 0, 400, 300, "PureBasic Window", #PB_Window_SystemMenu | #PB_Window_ScreenCentered)
    TextGadget(0, 10, 10, 200, 20, "Hello, PureBasic!")
    
    Repeat
        Event = WaitWindowEvent()
    Until Event = #PB_Event_CloseWindow
    
    CloseWindow(0)
EndIf
```

## Development

### Project Structure
```
vscode-purebasic/
├── package.json                 # Extension configuration file
├── syntaxes/purebasic.tmLanguage.json  # TextMate syntax definition
├── language-configuration.json  # Language configuration
├── src/
│   ├── extension.ts            # Extension entry point
│   └── server/
│       └── server.ts           # Language server
├── README.md
└── .vscodeignore
```

### Build and Test
- `npm install`: Install dependencies
- `npm run compile`: Compile TypeScript
- `npm run watch`: Watch for file changes and auto-compile
- `F5`: Start debugging in VSCode

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License