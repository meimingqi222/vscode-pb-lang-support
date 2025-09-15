# PureBasic Language Support for VSCode

A Visual Studio Code extension that provides comprehensive PureBasic language support.

## Features

### Basic Language Support
- ✅ **Syntax Highlighting**: Support for PureBasic keywords, strings, comments, numbers, etc.
- ✅ **Code Folding**: Support for folding procedures, functions, loops, and conditional statements
- ✅ **Bracket Matching**: Automatic matching of brackets and quotes
- ✅ **Comment Support**: Line comment (;) support

### Intelligent Language Features
- ✅ **Auto Completion**: Keywords, built-in functions, user-defined procedures, variables, and constants
- ✅ **Module Completion**: Support for `Module::Function` syntax completion
- ✅ **Go to Definition**: Jump to function/procedure definitions (including module functions)
- ✅ **Find All References**: Show all usage locations of variables/functions (including module calls)
- ✅ **Signature Help**: Function parameter hints and documentation
- ✅ **Hover Information**: Function signatures, parameter info, variable types, and documentation
- ✅ **Document Outline**: Hierarchical symbol view for navigation (Ctrl+Shift+O)
- ✅ **Error Diagnostics**: Real-time syntax checking with reduced false positives
- ✅ **Rename Symbol**: Rename variables, functions, and other symbols across files
- ✅ **Code Formatting**: Automatic code formatting and indentation

### Advanced Features
- ✅ **Symbol Caching**: Intelligent caching for improved performance with large projects
- ✅ **Workspace Symbols**: Cross-file symbol search and navigation
- ✅ **Code Actions**: Quick fixes and refactorings
- ✅ **Semantic Validation**: Advanced code analysis beyond basic syntax
- ✅ **Configuration Options**: Extensive customization options for all features

### Supported PureBasic Features
- ✅ **Keywords**: All major PureBasic keywords (Procedure, EndProcedure, If, EndIf, For, Next, etc.)
- ✅ **Data Types**: Built-in types (Integer, String, Float, etc.) and custom types
- ✅ **Built-in Functions**: Common functions (Debug, OpenWindow, MessageRequester, etc.)
- ✅ **Procedures**: Definition, declaration, and calling with parameter hints
- ✅ **Modules**: Module definitions and `Module::Function` syntax
- ✅ **Structures**: Structure definitions and member access
- ✅ **Constants**: `#CONSTANT` definitions and usage
- ✅ **Variables**: Global, Protected, Static variable declarations
- ✅ **Include Files**: Basic support for `IncludeFile` directives
- ✅ **Arrays and Lists**: Enhanced IntelliSense for arrays, lists, and maps with specialized functions
- ✅ **API Calls**: Comprehensive support including Windows API, graphics, networking, database, and threading functions

## Installation

### Development Version
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press F5 in VSCode to start debugging

### Release Version
Search for "PureBasic Language Support" in the VSCode Extension Marketplace and install

## Configuration

The extension provides extensive configuration options. Access these via:
- VSCode Settings (Ctrl+,)
- Search for "PureBasic" to see all available options

### Basic Configuration

```json
{
  "purebasic.maxNumberOfProblems": 100,
  "purebasic.enableValidation": true,
  "purebasic.enableCompletion": true,
  "purebasic.validationDelay": 500
}
```


### Formatting Configuration

```json
{
  "purebasic.formatting.enabled": true,
  "purebasic.formatting.indentSize": 4,
  "purebasic.formatting.tabSize": 4,
  "purebasic.formatting.insertSpaces": true,
  "purebasic.formatting.trimTrailingWhitespace": true
}
```

### Performance Configuration

```json
{
  "purebasic.performance.enableIncrementalParsing": true,
  "purebasic.performance.maxFileSize": 1048576,
  "purebasic.symbols.cacheEnabled": true,
  "purebasic.symbols.cacheSize": 1000
}
```

### Completion Configuration

```json
{
  "purebasic.completion.triggerCharacters": [".", "(", "["],
  "purebasic.completion.autoClosingPairs": true,
  "purebasic.completion.suggestOnType": true
}
```

### Linting Configuration

```json
{
  "purebasic.linting.enableSemanticValidation": true,
  "purebasic.linting.checkUnusedVariables": true,
  "purebasic.linting.checkUndefinedSymbols": true,
  "purebasic.linting.enableCodeActions": true
}
```

## Usage

1. Create or open a `.pb` or `.pbi` file
2. Start writing PureBasic code
3. Enjoy intelligent code completion, syntax highlighting, and other features

### Commands

The extension provides several commands accessible via:
- Command Palette (Ctrl+Shift+P)
- Right-click context menu
- Keyboard shortcuts

#### Available Commands

- **PureBasic: Show Diagnostics** - Focus on the Problems panel
- **PureBasic: Restart Language Server** - Restart the language server
- **PureBasic: Clear Symbol Cache** - Clear the symbol cache
- **PureBasic: Format Document** - Format the current document
- **PureBasic: Find Symbols in Workspace** - Search for symbols across the workspace

#### Keyboard Shortcuts

- `F12` - Go to Definition
- `Shift+F12` - Find All References
- `Ctrl+Shift+O` - Go to Symbol in File
- `Ctrl+Shift+M` - Show Problems
- `F2` - Rename Symbol
- `Shift+Alt+F` - Format Document
- `Ctrl+Space` - Trigger Suggestions

### Testing Features

Use the included test file (`test.pb`) to verify functionality:

```purebasic
; Test basic completion
SkipT  ; Should suggest SkipTest
SkipTest(  ; Should show parameter hint

; Test module completion
WindowUtils::  ; Should show TemplateMatch function

; Test go to definition (F12)
SkipTest  ; Right-click → Go to Definition

; Test find references (Shift+F12)
TemplateMatch  ; Right-click → Find All References

; Test hover information
SkipTest  ; Hover to see function signature

; Test document outline
; Press Ctrl+Shift+O to see document symbols

; Test rename symbol (F2)
SkipTest  ; Right-click → Rename Symbol

; Test code formatting (Shift+Alt+F)
; Format entire document or selected text

; Test enhanced arrays and lists
NewList MyList.s()  ; Should show list-specific completions
AddElement  ; Should suggest AddElement() with List Function type

; Test API functions
MessageBox_  ; Should show Windows API Function
LoadSprite  ; Should show Graphics/Game Function
```

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
│   ├── server/                 # Language server implementation
│   │   ├── server.ts          # Main language server
│   │   ├── config/            # Configuration management
│   │   ├── providers/        # Language feature providers
│   │   ├── symbols/          # Symbol management
│   │   ├── validation/       # Code validation
│   │   └── utils/            # Utility functions
│   └── types/                 # TypeScript type definitions
│       ├── core/             # Core types
│       ├── providers/        # Provider types
│       ├── utils/            # Utility types
│       └── server/           # Server types
├── test/                       # Test files
├── snippets/                   # Code snippets
├── icons/                      # Extension icons
├── README.md
└── .vscodeignore
```

### Architecture

The extension follows a modular architecture with clear separation of concerns:

#### Language Server
- **Main Server**: Handles LSP protocol communication
- **Configuration**: Manages settings and configuration updates
- **Providers**: Implement individual language features (completion, hover, etc.)
- **Symbols**: Manages symbol indexing and caching
- **Validation**: Provides syntax and semantic validation

#### Type System
- **Core Types**: Document, symbol, diagnostic, and error types
- **Provider Types**: Specialized types for each language feature
- **Utility Types**: Generic helpers and caching types
- **Server Types**: Language server specific types


### Build and Test

#### Development Commands
- `npm install`: Install dependencies
- `npm run compile`: Compile TypeScript
- `npm run watch`: Watch for file changes and auto-compile
- `npm run test`: Run Jest tests
- `npm run test:watch`: Run tests in watch mode
- `npm run test:coverage`: Run tests with coverage report

#### Build Commands
- `npm run webpack`: Build with webpack (development)
- `npm run webpack:prod`: Build with webpack (production)
- `npm run webpack:watch`: Build with webpack in watch mode

#### Extension Commands
- `F5`: Start extension debugging in VSCode
- `Ctrl+Shift+B`: Build task

### Testing

The extension includes a comprehensive test suite:

#### Unit Tests
- Language feature providers
- Symbol management
- Configuration handling

#### Integration Tests
- Language server communication
- Extension lifecycle

## Contributing

### Development Setup

1. **Prerequisites**
   - Node.js 16+
   - VSCode with TypeScript extension
   - PureBasic compiler (for testing)

2. **Setup Development Environment**
   ```bash
   # Clone repository
   git clone https://github.com/meimingqi222/vscode-pb-lang-support.git
   cd vscode-purebasic

   # Install dependencies
   npm install

   # Compile TypeScript
   npm run compile

   # Run tests
   npm run test
   ```

3. **Development Workflow**
   ```bash
   # Watch mode for development
   npm run watch

   # Start debugging in VSCode
   # Open project in VSCode and press F5

   # Build extension package
   npm run webpack:prod
   npx vsce package
   ```

### Code Style Guidelines

- **TypeScript**: Strict mode enabled, comprehensive type definitions
- **Naming**: Use PascalCase for types/classes, camelCase for variables/functions
- **Comments**: JSDoc comments for all public APIs
- **Error Handling**: Comprehensive error handling with typed errors
- **Testing**: Write unit tests for all new features

### Architecture Overview

The extension follows a modular architecture:

#### Core Components

1. **Extension Entry Point** (`src/extension.ts`)
   - VSCode extension activation
   - Language server setup
   - Command registration

2. **Language Server** (`src/server/server.ts`)
   - LSP protocol implementation
   - Feature coordination

3. **Providers** (`src/server/providers/`)
   - **Completion Provider**: Code completion and IntelliSense
   - **Hover Provider**: Documentation and type information
   - **Definition Provider**: Go to definition functionality
   - **Reference Provider**: Find all references
   - **Signature Provider**: Function parameter hints
   - **Document Symbol Provider**: Outline view
   - **Formatting Provider**: Code formatting
   - **Rename Provider**: Symbol renaming

4. **Type System** (`src/types/`)
   - Comprehensive type definitions
   - Type-safe interfaces
   - Generic utilities


### Testing

#### Running Tests
```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

#### Test Structure
```
test/
├── unit/              # Unit tests
│   ├── providers/     # Provider tests
│   ├── symbols/       # Symbol management tests
│   ├── validation/    # Validation tests
│   └── utils/         # Utility tests
├── integration/       # Integration tests
│   ├── server/        # Language server tests
│   ├── extension/     # Extension lifecycle tests
│   └── performance/   # Performance tests
└── fixtures/          # Test fixtures and samples
```

### Adding New Features

1. **Feature Implementation**
   - Add provider in `src/server/providers/`
   - Define types in `src/types/`
   - Register handler in `src/server/server.ts`
   - Add configuration options to `package.json`

2. **Testing Requirements**
   - Write unit tests for new functionality
   - Add integration tests if applicable
   - Update documentation

3. **Documentation**
   - Update README.md if feature is user-facing
   - Add JSDoc comments
   - Update type definitions

## API Reference

### Extension API

#### Configuration Interface
```typescript
interface PureBasicSettings {
    maxNumberOfProblems: number;
    enableValidation: boolean;
    enableCompletion: boolean;
    validationDelay: number;
    formatting?: FormattingSettings;
    completion?: CompletionSettings;
    linting?: LintingSettings;
    symbols?: SymbolsSettings;
    performance?: PerformanceSettings;
}
```


### Language Server API

#### Symbol Management
```typescript
interface PureBasicSymbol {
    name: string;
    kind: SymbolKind;
    range: SymbolRange;
    detail?: string;
    documentation?: string;
    module?: string;
    isPublic?: boolean;
    parameters?: string[];
    returnType?: string;
    id?: string;
    parentId?: string;
    children?: string[];
    tags?: SymbolTag[];
    modifiers?: SymbolModifier[];
    value?: string | number;
    defaultValue?: string;
    deprecated?: boolean;
}
```

#### Diagnostic System
```typescript
interface ExtendedDiagnostic extends Diagnostic {
    id?: string;
    sourceFile?: string;
    ruleId?: string;
    ruleName?: string;
    fixes?: DiagnosticFix[];
    related?: RelatedDiagnostic[];
    data?: unknown;
    tags?: DiagnosticTag[];
    priority?: DiagnosticPriority;
    confidence?: number;
}
```


### Provider APIs

#### Completion Provider
```typescript
interface ExtendedCompletionItem extends CompletionItem {
    metadata?: CompletionItemMetadata;
    symbol?: PureBasicSymbol;
    matchScore?: number;
    sortText?: string;
    filterText?: string;
    insertText?: string;
    insertTextFormat?: InsertTextFormat;
    insertPosition?: 'Replace' | 'After' | 'Before';
    additionalTextEdits?: CompletionTextEdit[];
    command?: CompletionCommand;
    documentation?: CompletionDocumentation;
    preconditions?: CompletionCondition[];
    postconditions?: CompletionCondition[];
}
```

#### Symbol Cache
```typescript
class SymbolCache {
    constructor(config: CacheConfig);

    // Cache operations
    set(uri: string, symbols: PureBasicSymbol[]): void;
    get(uri: string): PureBasicSymbol[] | null;
    findSymbol(query: string): SymbolMatch[];
    findSymbolDetailed(query: string): SymbolMatchDetail[];

    // Cache management
    clear(): void;
    invalidate(uri: string): void;
    getStats(): CacheStats;
}
```

### Utility APIs

#### Error Handling
```typescript
interface ErrorContext {
    operation: string;
    documentUri?: string;
    position?: Position;
    additional?: Record<string, unknown>;
    component?: string;
    userId?: string;
}

class ErrorHandler {
    handleAsync<T>(operation: string, fn: () => Promise<T>, options?: ErrorHandlerOptions): Promise<T>;
    handleSync<T>(operation: string, fn: () => T, options?: ErrorHandlerOptions): T;
}
```

#### Performance Utilities
```typescript
class PerformanceMonitor {
    measure<T>(operation: string, fn: () => T): T;
    measureAsync<T>(operation: string, fn: () => Promise<T>): Promise<T>;
    getMetrics(): PerformanceMetrics;
    reset(): void;
}
```

### Event System

#### Symbol Events
```typescript
type SymbolEventType =
    | 'symbolAdded'
    | 'symbolRemoved'
    | 'symbolUpdated'
    | 'cacheCleared'
    | 'cacheInvalidated';

interface SymbolEvent {
    type: SymbolEventType;
    uri: string;
    symbol?: PureBasicSymbol;
    timestamp: number;
}
```


## License

MIT License

---

**PureBasic** is a registered trademark of Fantaisie Software. This extension is not affiliated with or endorsed by Fantaisie Software.