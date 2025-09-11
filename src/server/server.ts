import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    Definition,
    Location,
    Position,
    Range,
    Diagnostic,
    DiagnosticSeverity,
    Hover,
    MarkupKind,
    TextEdit,
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    TextDocumentEdit,
    SignatureHelp,
    SignatureHelpContext,
    SignatureHelpTriggerKind,
    ParameterInformation,
    SignatureInformation
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', '(', ' ', ':', '::']
            },
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',']
            },
            documentFormattingProvider: true,
            renameProvider: true,
            codeActionProvider: true
        }
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
});

interface PureBasicSettings {
    maxNumberOfProblems: number;
}

const defaultSettings: PureBasicSettings = { maxNumberOfProblems: 1000 };
let globalSettings: PureBasicSettings = defaultSettings;

let documentSettings: Map<string, Thenable<PureBasicSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <PureBasicSettings>(
            (change.settings.languageServerPurebasic || defaultSettings)
        );
    }

    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<PureBasicSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'purebasic'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
    updateSymbolTable(change.document);
});

documents.onDidOpen(change => {
    updateSymbolTable(change.document);
});

documents.onDidClose(change => {
    globalSymbols.delete(change.document.uri);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri) || defaultSettings;
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    const lines = text.split(/\r?\n/g);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        if (trimmedLine === '') continue;
        
        // Check Procedure syntax - allow no parameters, but exclude ProcedureReturn
        if (trimmedLine.startsWith('Procedure') && trimmedLine.length > 9 && !trimmedLine.startsWith('ProcedureReturn')) {
            const procMatch = trimmedLine.match(/^Procedure\s*\.?\w*\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?/);
            if (!procMatch) {
                const diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    message: 'Invalid Procedure syntax',
                    source: 'purebasic'
                };
                diagnostics.push(diagnostic);
            }
        }
        
        // Check If statement syntax - based on official PureBasic syntax (If doesn't require Then)
        if (trimmedLine.startsWith('If ')) {
            // PureBasic支持多种If语法:
            // 1. If condition (单行，自动到行尾) - 有效语法
            // 2. If condition : statement (单行)
            // 3. If condition : statement1 : statement2 (单行多个语句)
            // 4. If condition : EndIf (多行)
            // 5. If condition Then statements : EndIf (Then可选)
            
            // Check if it's a single-line If
            const isSingleLineIf = 
                trimmedLine.includes(': EndIf') || // Contains : EndIf is single-line If
                (!trimmedLine.includes(':') && !trimmedLine.includes('EndIf')); // No colon and EndIf is single-line If
            
            if (!isSingleLineIf) {
                // Check if it's a multi-line If (requires EndIf)
                let hasEndIf = false;
                let indentLevel = 0;
                
                for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    
                    // Count nested If statements
                    if (nextLine.startsWith('If ')) indentLevel++;
                    if (nextLine === 'EndIf' || nextLine.startsWith('EndIf')) {
                        if (indentLevel === 0) {
                            hasEndIf = true;
                            break;
                        } else {
                            indentLevel--;
                        }
                    }
                }
                
                // Only warn if it's multi-line If but no EndIf
                if (!hasEndIf) {
                    const diagnostic: Diagnostic = {
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: i, character: 0 },
                            end: { line: i, character: line.length }
                        },
                        message: 'Multi-line If statement should have corresponding EndIf',
                        source: 'purebasic'
                    };
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    if (diagnostics.length > settings.maxNumberOfProblems) {
        diagnostics.length = settings.maxNumberOfProblems;
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
    // connection.console.log('We received an file change event');
});

const keywords = [
    'If', 'Then', 'Else', 'ElseIf', 'EndIf', 'For', 'Next', 'Step', 'To',
    'While', 'Wend', 'Repeat', 'Until', 'Forever', 'Select', 'Case', 'Default', 'EndSelect',
    'Break', 'Continue', 'Goto', 'Gosub', 'Return', 'End', 'Procedure',
    'EndProcedure', 'ProcedureReturn', 'Declare', 'Prototype', 'Interface', 'EndInterface',
    'Structure', 'EndStructure', 'Enumeration', 'EndEnumeration', 'Data', 'Read',
    'Restore', 'NewList', 'AddElement', 'InsertElement', 'DeleteElement',
    'ClearList', 'ListIndex', 'ResetList', 'NextElement', 'PreviousElement',
    'ForEach', 'With', 'EndWith', 'Module', 'EndModule', 'DeclareModule', 
    'EndDeclareModule', 'UseModule', 'UnuseModule', 'EnableExplicit', 'DisableExplicit'
];

const types = [
    'Integer', 'Long', 'Word', 'Byte', 'Character', 'String', 'FixedString',
    'Float', 'Double', 'Quad', 'Ascii', 'Unicode'
];

const builtInFunctions = [
    'OpenWindow', 'CreateGadgetList', 'EventWindow', 'EventGadget', 'EventMenu',
    'WaitWindowEvent', 'WindowEvent', 'SetActiveWindow', 'CloseWindow', 'WindowID',
    'WindowOutput', 'WindowX', 'WindowY', 'WindowWidth', 'WindowHeight',
    'DesktopWidth', 'DesktopHeight', 'DesktopDepth', 'DesktopFrequency', 'Delay',
    'CountProgramParameters', 'ProgramParameter', 'RunProgram', 'OpenFile',
    'ReadFile', 'WriteFile', 'CloseFile', 'FileSeek', 'FileSize', 'Eof',
    'ReadString', 'WriteString', 'ReadCharacter', 'WriteCharacter', 'ReadByte',
    'WriteByte', 'ReadWord', 'WriteWord', 'ReadLong', 'WriteLong', 'ReadQuad',
    'WriteQuad', 'ReadFloat', 'WriteFloat', 'ReadDouble', 'WriteDouble',
    'CreateDirectory', 'DeleteFile', 'CopyFile', 'RenameFile', 'DirectoryEntry',
    'DirectoryEntryType', 'DirectoryEntryName', 'DirectoryEntrySize',
    'DirectoryEntryDate', 'DirectoryEntryAttributes', 'NextDirectoryEntry',
    'FinishDirectory', 'ExamineDirectory', 'SetCurrentDirectory',
    'GetCurrentDirectory', 'CreateFile', 'FileBuffers', 'FileID', 'FileError',
    'MessageRequester', 'InputRequester', 'OpenFileRequester', 'SaveFileRequester',
    'PathRequester', 'ColorRequester', 'FontRequester'
];

connection.onCompletion(
    (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        // connection.console.log('Completion requested');
        const completions: CompletionItem[] = [];

        const document = documents.get(textDocumentPosition.textDocument.uri);
        if (!document) {
            return completions;
        }

        const text = document.getText();
        const position = textDocumentPosition.position;
        const lines = text.split(/\r?\n/g);
        const currentLine = lines[position.line];
        const lineUpToCursor = currentLine.substring(0, position.character);

        // Check if it's module member access (moduleName::)
        const moduleAccessMatch = lineUpToCursor.match(/(\w+)::$/);
        if (moduleAccessMatch) {
            const moduleName = moduleAccessMatch[1];
            
            // Find all members of this module - improved module detection logic
            for (const [uri, symbols] of globalSymbols) {
                for (const symbol of symbols) {
                    // Check if belongs to this module - multiple matching strategies
                    let belongsToModule = false;
                    
                    // Strategy 1: Direct match moduleName field
                    if (symbol.moduleName === moduleName) {
                        belongsToModule = true;
                    }
                    // Strategy 2: Filename match (for .pbi files)
                    else if (!symbol.moduleName && uri.toLowerCase().includes('.pbi')) {
                        const fileName = uri.split('/').pop()?.split('\\').pop()?.replace(/\.(pb|pbi)$/, '') || '';
                        if (fileName.toLowerCase() === moduleName.toLowerCase()) {
                            belongsToModule = true;
                        }
                    }
                    // Strategy 3: URI path contains module name
                    else if (!symbol.moduleName && uri.toLowerCase().includes(moduleName.toLowerCase())) {
                        belongsToModule = true;
                    }
                    // Strategy 4: For DeclareModule, check if there's corresponding Module implementation
                    else if (symbol.moduleName && symbol.moduleName.toLowerCase() === moduleName.toLowerCase()) {
                        belongsToModule = true;
                    }
                    
                    // Only show public interface (declared in DeclareModule)
                    // Compatibility: If symbol has no isPublic field but has moduleName field, treat as public interface
                    const isPublicInterface = symbol.isPublic !== undefined ? symbol.isPublic : (symbol.moduleName !== undefined);
                    if (belongsToModule && isPublicInterface) {
                        let completionKind: CompletionItemKind;
                        switch (symbol.type) {
                            case 'procedure':
                                completionKind = CompletionItemKind.Function;
                                break;
                            case 'variable':
                                completionKind = CompletionItemKind.Variable;
                                break;
                            case 'constant':
                                completionKind = CompletionItemKind.Constant;
                                break;
                            case 'structure':
                                completionKind = CompletionItemKind.Struct;
                                break;
                            case 'interface':
                                completionKind = CompletionItemKind.Interface;
                                break;
                            default:
                                completionKind = CompletionItemKind.Text;
                        }

                        completions.push({
                            label: symbol.name,
                            kind: completionKind,
                            detail: `${symbol.type} (${moduleName})`,
                            documentation: symbol.definition,
                            insertText: symbol.name
                        });
                    }
                }
            }
            
            // connection.console.log(`Module completion for ${moduleName}: ${completions.length} items`);
            return completions;
        }

        // Check if it's partial input (like WindowUt)
        const wordMatch = lineUpToCursor.match(/(\w+)$/);
        if (wordMatch) {
            const partialWord = wordMatch[1];
            
            // Find module names - support multiple module definition methods
            const moduleNames = new Set<string>();
            const allModules = new Set<string>();
            
            // Collect all module names
            for (const [uri, symbols] of globalSymbols) {
                for (const symbol of symbols) {
                    if (symbol.moduleName) {
                        allModules.add(symbol.moduleName);
                    }
                }
                
                // Infer module name from filename
                const fileName = uri.split('/').pop()?.split('\\').pop()?.replace(/\.(pb|pbi)$/, '') || '';
                if (fileName && symbols.length > 0) {
                    allModules.add(fileName);
                }
            }
            
            // Filter matching module names
            for (const moduleName of allModules) {
                if (moduleName.toLowerCase().includes(partialWord.toLowerCase())) {
                    moduleNames.add(moduleName);
                }
            }
            
            // Add module name completion
            for (const moduleName of moduleNames) {
                completions.push({
                    label: moduleName,
                    kind: CompletionItemKind.Module,
                    detail: 'Module',
                    documentation: `Module with ${globalSymbols.size} symbols`
                });
            }
            
            // Add matching partial symbols
            for (const [uri, symbols] of globalSymbols) {
                for (const symbol of symbols) {
                    if (symbol.name.toLowerCase().includes(partialWord.toLowerCase())) {
                        let completionKind: CompletionItemKind;
                        switch (symbol.type) {
                            case 'procedure':
                                completionKind = CompletionItemKind.Function;
                                break;
                            case 'variable':
                                completionKind = CompletionItemKind.Variable;
                                break;
                            case 'constant':
                                completionKind = CompletionItemKind.Constant;
                                break;
                            case 'structure':
                                completionKind = CompletionItemKind.Struct;
                                break;
                            case 'interface':
                                completionKind = CompletionItemKind.Interface;
                                break;
                            default:
                                completionKind = CompletionItemKind.Text;
                        }

                        let detail = symbol.type;
                        if (symbol.moduleName) {
                            detail += ` (${symbol.moduleName})`;
                        }

                        completions.push({
                            label: symbol.name,
                            kind: completionKind,
                            detail: detail,
                            documentation: symbol.definition
                        });
                    }
                }
            }
        }

        // Add keywords
        keywords.forEach(keyword => {
            completions.push({
                label: keyword,
                kind: CompletionItemKind.Keyword,
                documentation: keyword
            });
        });

        // Add data types
        types.forEach(type => {
            completions.push({
                label: type,
                kind: CompletionItemKind.TypeParameter,
                documentation: type
            });
        });

        // Add built-in functions
        builtInFunctions.forEach(func => {
            completions.push({
                label: func,
                kind: CompletionItemKind.Function,
                documentation: func
            });
        });

        // connection.console.log(`Returning ${completions.length} completions`);
        return completions;
    }
);

// Module符号解析
interface ModuleSymbol {
    name: string;
    type: 'procedure' | 'variable' | 'constant' | 'structure' | 'interface';
    line: number;
    moduleName?: string;
    documentUri: string;
    definition: string;
    isPublic?: boolean;  // 标识是否为公共接口（在DeclareModule中声明）
}

// 全局符号表
const globalSymbols: Map<string, ModuleSymbol[]> = new Map();

// 防抖和缓存
const symbolUpdateTimeouts: Map<string, NodeJS.Timeout> = new Map();
const parsedFilesCache: Map<string, { contentHash: number; symbols: ModuleSymbol[]; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 60秒缓存 - 更长的缓存时间

// 简单的哈希函数
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    return hash;
}

// 解析文档中的符号
function parseDocumentSymbols(document: TextDocument): ModuleSymbol[] {
    const uri = document.uri;
    const content = document.getText();
    const contentHash = hashString(content);
    const now = Date.now();
    
    // 检查缓存
    const cached = parsedFilesCache.get(uri);
    if (cached && cached.contentHash === contentHash && (now - cached.timestamp) < CACHE_TTL) {
        return cached.symbols; // 静默使用缓存，减少日志
    }
    
    const symbols: ModuleSymbol[] = [];
    const lines = content.split(/\r?\n/g);
    let currentModule: string | null = null;
    let inProcedure = false;  // 跟踪是否在Procedure内部
    let inDeclareModule = false;  // 跟踪是否在DeclareModule部分（公共接口）
    let inModuleSection = false;  // 跟踪是否在Module部分（私有实现）
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 快速检查行首字符，避免不必要的正则匹配
        const firstChar = line.charAt(0);
        const firstTwoChars = line.substring(0, 2);
        
        // DeclareModule定义（公共接口）
        if (firstTwoChars === 'De') {
            const declareModuleMatch = line.match(/^DeclareModule\s+(\w+)/);
            if (declareModuleMatch) {
                currentModule = declareModuleMatch[1];
                inDeclareModule = true;
                inModuleSection = false;
                continue;
            }
        }
        
        // EndDeclareModule
        if (firstTwoChars === 'En' && line === 'EndDeclareModule') {
            currentModule = null;
            inDeclareModule = false;
            continue;
        }
        
        // Module定义（私有实现）
        if (firstChar === 'M') {
            const moduleMatch = line.match(/^Module\s+(\w+)/);
            if (moduleMatch) {
                currentModule = moduleMatch[1];
                inModuleSection = true;
                inDeclareModule = false;
                continue;
            }
        }
        
        // EndModule
        if (firstTwoChars === 'En' && line === 'EndModule') {
            currentModule = null;
            inModuleSection = false;
            continue;
        }
        
        // 过程定义 - 支持各种格式：Procedure name, Procedure.s name, Procedure.i name(param)
        if (firstChar === 'P') {
            const procMatch = line.match(/^Procedure\s*(?:\.\w+)?\s*(\w+)\s*(?:\([^)]*\))?/);
            if (procMatch) {
                inProcedure = true;  // 进入Procedure作用域
                // 在Module部分的Procedure是私有实现
                const isPublicInterface = false;  // 实际的Procedure实现都是私有的
                symbols.push({
                    name: procMatch[1],
                    type: 'procedure',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
        
        // EndProcedure - 退出Procedure作用域
        if (firstTwoChars === 'En' && line === 'EndProcedure') {
            inProcedure = false;  // 退出Procedure作用域
            continue;
        }
        
        // Declare语句（模块内部的过程声明）- 在DeclareModule中的Declare是公共接口
        if (firstChar === 'D') {
            const declareMatch = line.match(/^Declare\s+(?:\.\w+)?\s*(\w+)\s*(?:\([^)]*\))?/);
            if (declareMatch) {
                // 在DeclareModule中的Declare语句定义公共接口
                const isPublicInterface = inDeclareModule && !inProcedure;
                symbols.push({
                    name: declareMatch[1],
                    type: 'procedure',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
        
        // 变量定义 - 只收集模块级别的变量（不在Procedure内部）
        if (!inProcedure && (firstChar === 'G' || firstChar === 'P' || firstChar === 'S' || firstChar === 'D')) {
            const varMatch = line.match(/^(Global|Protected|Static|Dim)\s+(\w+)/);
            if (varMatch) {
                // 只有在DeclareModule中的变量才是公共接口
                const isPublicInterface = inDeclareModule;
                symbols.push({
                    name: varMatch[2],
                    type: 'variable',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
        
        // 常量定义 - 只收集模块级别的常量（不在Procedure内部）
        if (!inProcedure && firstChar === '#') {
            const constMatch = line.match(/^#(\w+)\s*=/);
            if (constMatch) {
                // 只有在DeclareModule中的常量才是公共接口
                const isPublicInterface = inDeclareModule;
                symbols.push({
                    name: constMatch[1],
                    type: 'constant',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
        
        // 结构体定义 - 只收集模块级别的结构体（不在Procedure内部）
        if (!inProcedure && firstChar === 'S') {
            const structMatch = line.match(/^Structure\s+(\w+)/);
            if (structMatch) {
                // 只有在DeclareModule中的结构体才是公共接口
                const isPublicInterface = inDeclareModule;
                symbols.push({
                    name: structMatch[1],
                    type: 'structure',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
        
        // 接口定义 - 只收集模块级别的接口（不在Procedure内部）
        if (!inProcedure && firstChar === 'I') {
            const interfaceMatch = line.match(/^Interface\s+(\w+)/);
            if (interfaceMatch) {
                // 只有在DeclareModule中的接口才是公共接口
                const isPublicInterface = inDeclareModule;
                symbols.push({
                    name: interfaceMatch[1],
                    type: 'interface',
                    line: i,
                    moduleName: currentModule || undefined,
                    documentUri: document.uri,
                    definition: line,
                    isPublic: isPublicInterface
                });
                continue;
            }
        }
    }
    
    // 更新缓存
    parsedFilesCache.set(uri, {
        contentHash: contentHash,
        symbols: symbols,
        timestamp: now
    });
    
    return symbols;
}

// 更新符号表
function updateSymbolTable(document: TextDocument) {
    const uri = document.uri;
    
    // 清除之前的防抖定时器
    if (symbolUpdateTimeouts.has(uri)) {
        clearTimeout(symbolUpdateTimeouts.get(uri));
        symbolUpdateTimeouts.delete(uri);
    }
    
    // 设置新的防抖定时器
    const timeout = setTimeout(() => {
        performSymbolTableUpdate(document);
        symbolUpdateTimeouts.delete(uri);
    }, 300); // 300ms防抖
    
    symbolUpdateTimeouts.set(uri, timeout);
}

// 实际执行符号表更新
function performSymbolTableUpdate(document: TextDocument) {
    const uri = document.uri;
    const text = document.getText();
    
    // 计算内容哈希，避免重复解析相同内容
    const contentHash = hashString(text);
    
    // 检查是否已经缓存了相同的内容
    const cached = parsedFilesCache.get(uri);
    if (cached && cached.contentHash === contentHash && (Date.now() - cached.timestamp) < CACHE_TTL) {
        // 内容没有变化，使用缓存的符号
        globalSymbols.set(uri, cached.symbols);
        return;
    }
    
    const symbols = parseDocumentSymbols(document);
    
    // 处理IncludeFile - 加载包含文件的符号
    const lines = text.split(/\r?\n/g);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const includeMatch = line.match(/^IncludeFile\s+"([^"]+)"/);
        if (includeMatch) {
            const includePath = includeMatch[1];
            
            // 处理相对路径
            let includeUri: string;
            if (document.uri.startsWith('file:///')) {
                // 从file:/// URI中提取路径
                const filePath = document.uri.substring(8); // 移除 'file:///'
                const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
                includeUri = 'file:///' + currentDir + '/' + includePath;
            } else {
                const currentDir = document.uri.substring(0, document.uri.lastIndexOf('/'));
                includeUri = currentDir + '/' + includePath;
            }
            
            // 检查是否已经处理过这个文件
            if (globalSymbols.has(includeUri)) {
                // connection.console.log(`IncludeFile already processed: ${includeUri}`);
                continue;
            }
            
            // connection.console.log(`Processing IncludeFile: ${includePath} -> ${includeUri}`);
            
            // 尝试获取包含的文件（如果已打开）
            const includedDoc = documents.get(includeUri);
            if (includedDoc) {
                const includedSymbols = parseDocumentSymbols(includedDoc);
                globalSymbols.set(includeUri, includedSymbols);
                // connection.console.log(`Loaded symbols from included file: ${includeUri} (${includedSymbols.length} symbols)`);
            } else {
                // 如果文件没有打开，尝试从文件系统读取
                const fs = require('fs');
                const path = require('path');
                
                // 转换URI到文件路径
                let filePath = includeUri;
                if (filePath.startsWith('file:///')) {
                    filePath = filePath.substring(8); // 移除 'file:///'
                }
                filePath = decodeURIComponent(filePath);
                
                // 处理Windows路径
                if (filePath.includes('/')) {
                    filePath = filePath.replace(/\//g, '\\');
                }
                
                if (fs.existsSync(filePath)) {
                    try {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const contentHash = hashString(content);
                        // 检查文件系统缓存
                        const fileCacheKey = `fs:${filePath}`;
                        const cached = parsedFilesCache.get(fileCacheKey);
                        if (cached && cached.contentHash === contentHash && (Date.now() - cached.timestamp) < CACHE_TTL) {
                            globalSymbols.set(includeUri, cached.symbols);
                        } else {
                            // 创建虚拟文档对象
                            const virtualDoc = {
                                uri: includeUri,
                                getText: () => content,
                                languageId: 'purebasic'
                            } as TextDocument;
                            
                            const includedSymbols = parseDocumentSymbols(virtualDoc);
                            globalSymbols.set(includeUri, includedSymbols);
                            
                            // 更新文件系统缓存
                            parsedFilesCache.set(fileCacheKey, {
                                contentHash: contentHash,
                                symbols: includedSymbols,
                                timestamp: Date.now()
                            });
                        }
                    } catch (error) {
                        // connection.console.log(`Error reading included file: ${filePath} - ${error}`);
                    }
                } else {
                    // connection.console.log(`Included file not found: ${filePath}`);
                }
            }
        }
    }
    
    globalSymbols.set(uri, symbols);
    
    // 更新缓存
    parsedFilesCache.set(uri, {
        contentHash: contentHash,
        symbols: symbols,
        timestamp: Date.now()
    });
}

connection.onDefinition((params: TextDocumentPositionParams): Definition | undefined => {
    // connection.console.log(`Definition requested for: ${JSON.stringify(params)}`);
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        // connection.console.log('Document not found');
        return undefined;
    }

    // 更新符号表
    updateSymbolTable(document);
    
    const text = document.getText();
    const lines = text.split(/\r?\n/g);
    const position = params.position;
    
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
        // connection.console.log('Word range not found');
        return undefined;
    }
    
    const word = document.getText(wordRange);
    // connection.console.log(`Looking for definition of: ${word}`);
    
    // 首先检查是否是IncludeFile语句
    const currentLine = lines[position.line];
    const includeMatch = currentLine.match(/IncludeFile\s+"([^"]+)"/);
    if (includeMatch && includeMatch.index !== undefined && position.character >= includeMatch.index && position.character <= includeMatch.index + includeMatch[0].length) {
        const includePath = includeMatch[1];
        // 解析相对路径
        const currentDir = document.uri.substring(0, document.uri.lastIndexOf('/'));
        const includeUri = currentDir + '/' + includePath;
        
        // connection.console.log(`Found IncludeFile: ${includePath} -> ${includeUri}`);
        
        // 尝试打开包含的文件
        const includedDoc = documents.get(includeUri);
        if (includedDoc) {
            return Location.create(includeUri, Range.create(0, 0, 0, 0));
        }
    }
    
    // 在当前文档中查找
    const currentSymbols = globalSymbols.get(document.uri) || [];
    // connection.console.log(`Current document symbols: ${currentSymbols.map(s => s.name).join(', ')}`);
    for (const symbol of currentSymbols) {
        if (symbol.name === word) {
            // connection.console.log(`Found definition in current document: ${symbol.definition} at line ${symbol.line}`);
            return Location.create(
                symbol.documentUri,
                Range.create(symbol.line, 0, symbol.line, 100) // 使用固定长度而不是lines[symbol.line].length
            );
        }
    }
    
    // 在所有文档中查找（跨文件支持）
    for (const [uri, symbols] of globalSymbols) {
        if (uri !== document.uri) {
            for (const symbol of symbols) {
                if (symbol.name === word) {
                    // connection.console.log(`Found definition in ${uri}: ${symbol.definition}`);
                    
                    // 获取目标文档的行内容
                    const targetDoc = documents.get(uri);
                    let lineLength = 100;
                    if (targetDoc) {
                        const targetLines = targetDoc.getText().split(/\r?\n/g);
                        if (symbol.line < targetLines.length) {
                            lineLength = targetLines[symbol.line].length;
                        }
                    }
                    
                    return Location.create(
                        symbol.documentUri,
                        Range.create(symbol.line, 0, symbol.line, lineLength)
                    );
                }
            }
        }
    }
    
    // connection.console.log(`No definition found for: ${word}`);
    return undefined;
});

connection.onReferences((params: TextDocumentPositionParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    // 更新符号表
    updateSymbolTable(document);
    
    const position = params.position;
    
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
        return [];
    }
    
    const word = document.getText(wordRange);
    
    const references: Location[] = [];
    
    // 在所有文档中查找引用和定义
    for (const [uri, symbols] of globalSymbols) {
        const refDocument = documents.get(uri);
        if (!refDocument) continue;
        
        const text = refDocument.getText();
        const lines = text.split(/\r?\n/g);
        
        // 使用正则表达式精确匹配单词
        const wordRegex = new RegExp(`\\b${word}\\b`, 'g');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match;
            
            while ((match = wordRegex.exec(line)) !== null) {
                // 检查是否是定义行
                const isDefinition = symbols.some(s => 
                    s.name === word && s.line === i && s.documentUri === uri
                );
                
                // 包含所有引用和定义（包括模块函数的实现）
                // 这样用户可以看到完整的引用链：声明 -> 实现 -> 调用
                references.push(
                    Location.create(
                        uri,
                        Range.create(i, match.index, i, match.index + word.length)
                    )
                );
            }
        }
    }
    
    return references;
});

connection.onHover((params: TextDocumentPositionParams): Hover | undefined => {
    // connection.console.log(`Hover requested for: ${JSON.stringify(params)}`);
    
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        // connection.console.log('Document not found');
        return undefined;
    }

    // 更新符号表
    updateSymbolTable(document);
    
    const position = params.position;
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
        // connection.console.log('Word range not found');
        return undefined;
    }
    
    const word = document.getText(wordRange);
    // connection.console.log(`Looking for hover info for: ${word}`);
    
    // 特殊处理ProcedureReturn
    if (word === 'ProcedureReturn') {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**ProcedureReturn**\n\n**Type:** Keyword\n\n**Description:** Returns a value from a procedure. Can be used at any point inside a procedure to immediately exit and return a value.\n\n**Syntax:**\n\`\`\`purebasic\nProcedureReturn [value]\n\`\`\`\n\n**Example:**\n\`\`\`purebasic\nProcedure.i AddNumbers(a.i, b.i)\n  ProcedureReturn a + b\nEndProcedure\n\`\`\``
            }
        };
    }
    
    // 在符号表中查找
    for (const [uri, symbols] of globalSymbols) {
        for (const symbol of symbols) {
            if (symbol.name === word) {
                let moduleInfo = '';
                if (symbol.moduleName) {
                    moduleInfo = `\n\n**Module:** ${symbol.moduleName}`;
                }
                
                let typeInfo = '';
                switch (symbol.type) {
                    case 'procedure':
                        typeInfo = 'Procedure';
                        break;
                    case 'variable':
                        typeInfo = 'Variable';
                        break;
                    case 'constant':
                        typeInfo = 'Constant';
                        break;
                    case 'structure':
                        typeInfo = 'Structure';
                        break;
                    case 'interface':
                        typeInfo = 'Interface';
                        break;
                }
                
                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: `**${word}**\n\n**Type:** ${typeInfo}${moduleInfo}\n\n**Definition:**\n\`${symbol.definition}\`\n\n**Location:** Line ${symbol.line + 1}`
                    }
                };
            }
        }
    }
    
    // 检查是否是内置函数
    if (builtInFunctions.includes(word)) {
        const functionDocs: { [key: string]: string } = {
            'OpenWindow': 'OpenWindow(WindowID, x, y, width, height, title$, flags)\n\nOpens a new window.',
            'CreateGadgetList': 'CreateGadgetList(WindowID)\n\nCreates a gadget list for the specified window.',
            'WaitWindowEvent': 'WaitWindowEvent()\n\nWaits for a window event and returns the event ID.',
            'MessageRequester': 'MessageRequester(title$, message$, flags)\n\nDisplays a message requester.',
            'Debug': 'Debug(value)\n\nOutputs a value to the debug console.',
            'Str': 'Str(value)\n\nConverts a numeric value to a string.',
            'Val': 'Val(string$)\n\nConverts a string to a numeric value.',
            'Len': 'Len(string$)\n\nReturns the length of a string.',
            'Left': 'Left(string$, length)\n\nReturns the leftmost characters of a string.',
            'Right': 'Right(string$, length)\n\nReturns the rightmost characters of a string.',
            'Mid': 'Mid(string$, start, length)\n\nReturns a substring from a string.'
        };
        
        const doc = functionDocs[word] || `**${word}**\n\nBuilt-in PureBasic function`;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: doc
            }
        };
    }
    
    // 检查是否是数据类型
    if (types.includes(word)) {
        const typeDocs: { [key: string]: string } = {
            'Integer': 'Integer\n\n32-bit signed integer (-2,147,483,648 to 2,147,483,647)',
            'Long': 'Long\n\n32-bit signed integer (same as Integer)',
            'Word': 'Word\n\n16-bit unsigned integer (0 to 65,535)',
            'Byte': 'Byte\n\n8-bit unsigned integer (0 to 255)',
            'String': 'String\n\nVariable-length string',
            'Float': 'Float\n\n32-bit floating-point number',
            'Double': 'Double\n\n64-bit floating-point number',
            'Quad': 'Quad\n\n64-bit signed integer'
        };
        
        const doc = typeDocs[word] || `**${word}**\n\nPureBasic data type`;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: doc
            }
        };
    }
    
    // 检查是否是关键字
    if (keywords.includes(word)) {
        const keywordDocs: { [key: string]: string } = {
            'Procedure': 'Procedure [returnType.] name([parameters])\n\nDefines a procedure.',
            'EndProcedure': 'EndProcedure\n\nEnds a procedure definition.',
            'Module': 'Module name\n\nStarts a module definition.',
            'EndModule': 'EndModule\n\nEnds a module definition.',
            'DeclareModule': 'DeclareModule name\n\nStarts a module declaration.',
            'EndDeclareModule': 'EndDeclareModule\n\nEnds a module declaration.',
            'UseModule': 'UseModule name\n\nImports a module for use.',
            'UnuseModule': 'UnuseModule name\n\nRemoves a module from use.',
            'EnableExplicit': 'EnableExplicit\n\nEnables explicit variable declaration.',
            'DisableExplicit': 'DisableExplicit\n\nDisables explicit variable declaration.',
            'If': 'If expression\n\nStarts a conditional block.',
            'Then': 'Then\n\nUsed with If to start the conditional block.',
            'Else': 'Else\n\nAlternative block for If statement.',
            'ElseIf': 'ElseIf expression\n\nAdditional condition for If statement.',
            'EndIf': 'EndIf\n\nEnds an If block.',
            'For': 'For variable = start To end [Step step]\n\nStarts a For loop.',
            'Next': 'Next [variable]\n\nEnds a For loop.',
            'While': 'While expression\n\nStarts a While loop.',
            'Wend': 'Wend\n\nEnds a While loop.',
            'Repeat': 'Repeat\n\nStarts a Repeat loop.',
            'Until': 'Until expression\n\nEnds a Repeat loop.',
            'Global': 'Global variable = value\n\nDeclares a global variable.',
            'Protected': 'Protected variable = value\n\nDeclares a protected variable.',
            'Static': 'Static variable = value\n\nDeclares a static variable.',
            'Dim': 'Dim array(size)\n\nDeclares an array.',
            'Structure': 'Structure name\n\nStarts a structure definition.',
            'EndStructure': 'EndStructure\n\nEnds a structure definition.',
            'Debug': 'Debug expression\n\nOutputs expression to debugger.'
        };
        
        const doc = keywordDocs[word] || `**${word}**\n\nPureBasic keyword`;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: doc
            }
        };
    }
    
    return undefined;
});

connection.onDocumentFormatting((params): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const text = document.getText();
    const lines = text.split(/\r?\n/g);
    const formattedLines: string[] = [];
    
    let indentLevel = 0;
    const indentSize = 2;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        if (line.startsWith('End') || line.startsWith('Else') || line.startsWith('Case') || line.startsWith('Until') || line.startsWith('Next') || line.startsWith('Wend')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }
        
        if (line !== '') {
            const indent = ' '.repeat(indentLevel * indentSize);
            formattedLines.push(indent + line);
        } else {
            formattedLines.push('');
        }
        
        if (line.startsWith('Procedure') || line.startsWith('If') || line.startsWith('For') || line.startsWith('While') || line.startsWith('Repeat') || line.startsWith('Select') || line.startsWith('Structure') || line.startsWith('Interface') || line.startsWith('Enumeration') || line.startsWith('With') || line.startsWith('Case') || line.startsWith('Else')) {
            indentLevel++;
        }
    }
    
    const formattedText = formattedLines.join('\n');
    const fullRange = Range.create(
        Position.create(0, 0),
        Position.create(lines.length - 1, lines[lines.length - 1].length)
    );
    
    return [TextEdit.replace(fullRange, formattedText)];
});

connection.onRenameRequest((params): { changes: { [uri: string]: TextEdit[] } } | undefined => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return undefined;
    }

    const position = params.position;
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
        return undefined;
    }
    
    const oldWord = document.getText(wordRange);
    const newWord = params.newName;
    
    const text = document.getText();
    const lines = text.split(/\r?\n/g);
    const changes: TextEdit[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const regex = new RegExp(`\\b${oldWord}\\b`, 'g');
        let match;
        
        while ((match = regex.exec(line)) !== null) {
            changes.push(TextEdit.replace(
                Range.create(i, match.index, i, match.index + oldWord.length),
                newWord
            ));
        }
    }
    
    return {
        changes: {
            [params.textDocument.uri]: changes
        }
    };
});

function getWordRangeAtPosition(document: TextDocument, position: Position): Range | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const lineContent = document.getText(Range.create(position.line, 0, position.line, 65535));
    
    let start = position.character;
    let end = position.character;
    
    while (start > 0 && /\w/.test(lineContent[start - 1])) {
        start--;
    }
    
    while (end < lineContent.length && /\w/.test(lineContent[end])) {
        end++;
    }
    
    if (start === end) {
        return undefined;
    }
    
    return Range.create(position.line, start, position.line, end);
}

// Code Action处理器
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) {
        return [];
    }

    const actions: CodeAction[] = [];
    const diagnostics = params.context.diagnostics;

    for (const diagnostic of diagnostics) {
        // 处理Procedure参数不匹配的错误
        if (diagnostic.message.includes('Procedure') && diagnostic.message.includes('parameter')) {
            const action = CodeAction.create(
                'Add missing parameters',
                {
                    changes: {
                        [params.textDocument.uri]: [
                            TextEdit.replace(diagnostic.range, 'ProcedureName(param1, param2)')
                        ]
                    }
                },
                CodeActionKind.QuickFix
            );
            actions.push(action);
        }

        // 处理Module未声明的错误
        if (diagnostic.message.includes('Module') && diagnostic.message.includes('not declared')) {
            const action = CodeAction.create(
                'Declare Module',
                {
                    changes: {
                        [params.textDocument.uri]: [
                            TextEdit.insert(Position.create(0, 0), 'DeclareModule YourModule\nEndDeclareModule\n\n')
                        ]
                    }
                },
                CodeActionKind.QuickFix
            );
            actions.push(action);
        }

        // 处理变量未声明的错误
        if (diagnostic.message.includes('variable') && diagnostic.message.includes('not declared')) {
            const wordRange = diagnostic.range;
            const variableName = textDocument.getText(wordRange);
            
            const action = CodeAction.create(
                `Declare variable '${variableName}'`,
                {
                    changes: {
                        [params.textDocument.uri]: [
                            TextEdit.insert(Position.create(wordRange.start.line, 0), `Define.${variableName}\n`)
                        ]
                    }
                },
                CodeActionKind.QuickFix
            );
            actions.push(action);
        }

        // 处理语法错误 - 添加缺失的EndIf
        if (diagnostic.message.includes('If') && diagnostic.message.includes('missing')) {
            const action = CodeAction.create(
                'Add missing EndIf',
                {
                    changes: {
                        [params.textDocument.uri]: [
                            TextEdit.insert(Position.create(diagnostic.range.end.line + 1, 0), 'EndIf\n')
                        ]
                    }
                },
                CodeActionKind.QuickFix
            );
            actions.push(action);
        }

        // 处理语法错误 - 添加缺失的EndProcedure
        if (diagnostic.message.includes('Procedure') && diagnostic.message.includes('missing')) {
            const action = CodeAction.create(
                'Add missing EndProcedure',
                {
                    changes: {
                        [params.textDocument.uri]: [
                            TextEdit.insert(Position.create(diagnostic.range.end.line + 1, 0), 'EndProcedure\n')
                        ]
                    }
                },
                CodeActionKind.QuickFix
            );
            actions.push(action);
        }
    }

    return actions;
});

// 内置函数的参数信息
const functionParameters: { [key: string]: { label: string; documentation: string; parameters: { label: string; documentation?: string }[] } } = {
    'OpenWindow': {
        label: 'OpenWindow(WindowID, x, y, width, height, title$, flags)',
        documentation: 'Opens a new window with the specified parameters.',
        parameters: [
            { label: 'WindowID', documentation: 'Unique identifier for the window' },
            { label: 'x', documentation: 'X position of the window' },
            { label: 'y', documentation: 'Y position of the window' },
            { label: 'width', documentation: 'Width of the window' },
            { label: 'height', documentation: 'Height of the window' },
            { label: 'title$', documentation: 'Title of the window' },
            { label: 'flags', documentation: 'Window flags' }
        ]
    },
    'MessageRequester': {
        label: 'MessageRequester(title$, message$, flags)',
        documentation: 'Displays a message requester.',
        parameters: [
            { label: 'title$', documentation: 'Title of the requester' },
            { label: 'message$', documentation: 'Message to display' },
            { label: 'flags', documentation: 'Requester flags' }
        ]
    },
    'Debug': {
        label: 'Debug(value)',
        documentation: 'Outputs a value to the debug console.',
        parameters: [
            { label: 'value', documentation: 'Value to debug' }
        ]
    },
    'Str': {
        label: 'Str(value)',
        documentation: 'Converts a numeric value to a string.',
        parameters: [
            { label: 'value', documentation: 'Numeric value to convert' }
        ]
    },
    'Val': {
        label: 'Val(string$)',
        documentation: 'Converts a string to a numeric value.',
        parameters: [
            { label: 'string$', documentation: 'String to convert' }
        ]
    },
    'Len': {
        label: 'Len(string$)',
        documentation: 'Returns the length of a string.',
        parameters: [
            { label: 'string$', documentation: 'String to get length of' }
        ]
    },
    'Left': {
        label: 'Left(string$, length)',
        documentation: 'Returns the leftmost characters of a string.',
        parameters: [
            { label: 'string$', documentation: 'Source string' },
            { label: 'length', documentation: 'Number of characters to return' }
        ]
    },
    'Right': {
        label: 'Right(string$, length)',
        documentation: 'Returns the rightmost characters of a string.',
        parameters: [
            { label: 'string$', documentation: 'Source string' },
            { label: 'length', documentation: 'Number of characters to return' }
        ]
    },
    'Mid': {
        label: 'Mid(string$, start, length)',
        documentation: 'Returns a substring from a string.',
        parameters: [
            { label: 'string$', documentation: 'Source string' },
            { label: 'start', documentation: 'Starting position' },
            { label: 'length', documentation: 'Number of characters to return' }
        ]
    }
};

// 签名帮助处理器
connection.onSignatureHelp((params): SignatureHelp | undefined => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return undefined;
    }

    const text = document.getText();
    const position = params.position;
    const lines = text.split(/\r?\n/g);
    const line = lines[position.line];
    
    // 查找函数调用的开始位置
    let functionStart = -1;
    let parenCount = 0;
    
    for (let i = position.character; i >= 0; i--) {
        const char = line[i];
        
        if (char === ')') {
            parenCount++;
        } else if (char === '(') {
            parenCount--;
            if (parenCount === 0) {
                // 找到了匹配的左括号，现在找函数名
                for (let j = i - 1; j >= 0; j--) {
                    const funcChar = line[j];
                    if (/\w/.test(funcChar)) {
                        functionStart = j;
                    } else if (functionStart !== -1) {
                        // 遇到了非单词字符，函数名结束
                        break;
                    }
                }
                break;
            }
        }
    }
    
    if (functionStart === -1) {
        return undefined;
    }
    
    // 提取函数名
    const functionName = line.substring(functionStart, line.indexOf('(', functionStart)).trim();
    
    // 查找函数定义
    let functionInfo = functionParameters[functionName];
    
    // 如果不是内置函数，在符号表中查找
    if (!functionInfo) {
        for (const [uri, symbols] of globalSymbols) {
            for (const symbol of symbols) {
                if (symbol.name === functionName && symbol.type === 'procedure') {
                    // 从定义中解析参数
                    const definition = symbol.definition;
                    const paramMatch = definition.match(/\(([^)]*)\)/);
                    
                    let parameters: { label: string; documentation?: string }[] = [];
                    let paramString = "";
                    
                    if (paramMatch) {
                        const params = paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
                        parameters = params.map(param => {
                            const parts = param.split('.');
                            const paramName = parts[parts.length - 1];
                            return { label: paramName };
                        });
                        paramString = params.join(', ');
                    } else {
                        // 没有参数的情况
                        paramString = "";
                    }
                    
                    functionInfo = {
                        label: `${functionName}(${paramString})`,
                        documentation: `User-defined procedure: ${functionName}`,
                        parameters: parameters
                    };
                    break;
                }
            }
            if (functionInfo) break;
        }
    }
    
    if (!functionInfo) {
        return undefined;
    }
    
    // 计算当前活动的参数
    let activeParameter = 0;
    let paramStart = line.indexOf('(', functionStart) + 1;
    let inString = false;
    
    for (let i = paramStart; i < position.character; i++) {
        const char = line[i];
        
        if (char === '"') {
            inString = !inString;
        } else if (char === ',' && !inString) {
            activeParameter++;
        }
    }
    
    return {
        signatures: [{
            label: functionInfo.label,
            documentation: functionInfo.documentation,
            parameters: functionInfo.parameters.map(param => ({
                label: param.label,
                documentation: param.documentation
            }))
        }],
        activeSignature: 0,
        activeParameter: Math.min(activeParameter, functionInfo.parameters.length - 1)
    };
});

documents.listen(connection);
connection.listen();