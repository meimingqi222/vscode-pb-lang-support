/**
 * 定义提供者
 * 为PureBasic提供转到定义功能
 */

import {
    DefinitionParams,
    Location,
    Position,
    Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { readFileIfExistsSync, resolveIncludePath, fsPathToUri, normalizeDirPath } from '../utils/fs-utils';
import { getWorkspaceFiles } from '../indexer/workspace-index';
import { analyzeScopesAndVariables } from '../utils/scope-manager';

/**
 * 处理定义请求
 */
export function handleDefinition(
    params: DefinitionParams,
    document: TextDocument,
    allDocuments: Map<string, TextDocument>,
    projectManager: any
): Location[] {
    const text = document.getText();
    const position = params.position;

    // 获取当前位置的单词
    const word = getWordAtPosition(text, position);
    if (!word) {
        return [];
    }

    // 收集可搜索文档：当前 + 已打开 + 递归包含
    const searchDocs = collectSearchDocuments(document, allDocuments);

    // 查找定义
    const definitions: Location[] = [];

    // 结构体成员访问：var\\member → 跳到 Structure 成员定义
    const structAccess = getStructAccessFromPosition(text, position);
    if (structAccess) {
        const scopeInfo = analyzeScopesAndVariables(text, position.line);
        const varInfo = scopeInfo.availableVariables.find(v => v.name.toLowerCase() === normalizeVarName(structAccess.varName).toLowerCase());
        if (varInfo) {
            const typeName = getBaseType(varInfo.type);
            if (typeName) {
                const structDefs = findStructureMemberDefinition(typeName, structAccess.memberName, searchDocs);
                definitions.push(...structDefs);
                if (definitions.length > 0) {
                    return definitions;
                }
            }
        }
    }

    // 先检查模块常量/结构等符号：Module::#CONST / Module::Type
    const moduleSymbol = getModuleSymbolFromPosition(document.getText(), position);
    if (moduleSymbol) {
        const moduleSymbolDefs = findModuleSymbolDefinition(
            moduleSymbol.moduleName,
            moduleSymbol.ident,
            searchDocs
        );
        definitions.push(...moduleSymbolDefs);
        if (definitions.length > 0) return definitions;
    }

    // 处理模块函数调用语法
    const moduleMatch = getModuleFunctionFromPosition(document.getText(), position);
    if (moduleMatch) {
        // 查找模块中的函数定义
        const moduleDefinitions = findModuleFunctionDefinition(
            moduleMatch.moduleName,
            moduleMatch.functionName,
            searchDocs
        );
        definitions.push(...moduleDefinitions);
        // 查找模块常量/结构等定义
        const moduleSymbolDefs = findModuleSymbolDefinition(
            moduleMatch.moduleName,
            moduleMatch.functionName,
            searchDocs
        );
        definitions.push(...moduleSymbolDefs);
    } else {
        // 首先在项目符号中查找
        if (projectManager) {
            const projectSymbol = projectManager.findSymbolDefinition(word, document.uri);
            if (projectSymbol) {
                // 将项目符号转换为Location
                try {
                    const lines = projectSymbol.file.split('\n');
                    const definitionLine = lines[projectSymbol.line] || '';
                    const startPos = definitionLine.indexOf(word);
                    if (startPos !== -1) {
                        definitions.push({
                            uri: projectSymbol.file,
                            range: {
                                start: { line: projectSymbol.line, character: startPos },
                                end: { line: projectSymbol.line, character: startPos + word.length }
                            }
                        });
                    }
                } catch (error) {
                    // 忽略转换错误
                }
            }
        }

        // 常规查找：遍历所有搜索文档
        for (const doc of searchDocs.values()) {
            const docDefinitions = findDefinitionsInDocument(doc, word);
            definitions.push(...docDefinitions);
        }
    }

    return definitions;
}

/**
 * 获取模块函数调用信息
 */
function getModuleFunctionFromPosition(text: string, position: Position): {
    moduleName: string;
    functionName: string;
} | null {
    const lines = text.split('\n');
    if (position.line >= lines.length) {
        return null;
    }

    const line = lines[position.line];
    const char = position.character;

    // 查找模块调用语法 Module::Function
    const beforeCursor = line.substring(0, char);
    const afterCursor = line.substring(char);

    const fullContext = beforeCursor + afterCursor;
    const moduleMatch = fullContext.match(/(\w+)::(\w+)/);

    if (moduleMatch) {
        // 检查光标是否在这个模块调用上
        const matchStart = line.indexOf(moduleMatch[0]);
        const matchEnd = matchStart + moduleMatch[0].length;

        if (char >= matchStart && char <= matchEnd) {
            return {
                moduleName: moduleMatch[1],
                functionName: moduleMatch[2]
            };
        }
    }

    return null;
}

/**
 * 查找模块中的函数定义
 */
function findModuleFunctionDefinition(
    moduleName: string,
    functionName: string,
    searchDocs: Map<string, TextDocument>
): Location[] {
    const definitions: Location[] = [];

    for (const doc of searchDocs.values()) {
        const text = doc.getText();
        const lines = text.split('\n');
        let inModule = false;
        let moduleStartLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 检查模块开始
            const moduleMatch = line.match(new RegExp(`^Module\\s+${moduleName}\\b`, 'i'));
            if (moduleMatch) {
                inModule = true;
                moduleStartLine = i;
                continue;
            }

            // 检查模块结束
            if (line.match(/^EndModule\b/i)) {
                inModule = false;
                continue;
            }

            // 在模块内查找函数定义
            if (inModule) {
                const procMatch = line.match(new RegExp(`^Procedure(?:C|DLL|CDLL)?(?:\\.\\w+)?\\s+(${functionName})\\s*\\(`, 'i'));
                if (procMatch) {
                    const startChar = lines[i].indexOf(procMatch[1]);
                    definitions.push({
                        uri: doc.uri,
                        range: {
                            start: { line: i, character: startChar },
                            end: { line: i, character: startChar + functionName.length }
                        }
                    });
                }
            }
        }
    }

    return definitions;
}

/**
 * 查找包含文件中的定义
 */
function findDefinitionsInIncludes(
    document: any,
    word: string,
    allDocuments: Map<string, any>
): Location[] {
    const definitions: Location[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // 查找IncludeFile语句
    for (const line of lines) {
        const includeMatch = line.match(/IncludeFile\s+"([^"]+)"/i);
        if (includeMatch) {
            const includePath = includeMatch[1];

            // 在已加载的文档中查找对应的包含文件
            for (const [uri, doc] of allDocuments) {
                if (uri.includes(includePath.replace(/\\/g, '/')) ||
                    uri.endsWith(includePath.split(/[\\\/]/).pop() || '')) {
                    const includeDefinitions = findDefinitionsInDocument(doc, word);
                    definitions.push(...includeDefinitions);
                }
            }
        }
    }

    return definitions;
}

/**
 * 获取位置处的单词（支持模块语法 Module::Function）
 */
function getWordAtPosition(text: string, position: Position): string | null {
    const lines = text.split('\n');
    if (position.line >= lines.length) {
        return null;
    }

    const line = lines[position.line];
    const char = position.character;

    // 查找单词边界（支持::语法）
    let start = char;
    let end = char;

    // 向前查找单词开始
    while (start > 0 && /[a-zA-Z0-9_:]/.test(line[start - 1])) {
        start--;
    }

    // 向后查找单词结束
    while (end < line.length && /[a-zA-Z0-9_:]/.test(line[end])) {
        end++;
    }

    if (start === end) {
        return null;
    }

    const fullWord = line.substring(start, end);

    // 处理模块调用语法 Module::Function
    if (fullWord.includes('::')) {
        const parts = fullWord.split('::');
        if (parts.length === 2) {
            // 检查光标在模块名还是函数名上
            const moduleEnd = start + parts[0].length;
            if (char <= moduleEnd) {
                return parts[0]; // 返回模块名
            } else {
                return parts[1]; // 返回函数名
            }
        }
    }

    return fullWord;
}

/**
 * 在文档中查找定义
 */
function findDefinitionsInDocument(document: TextDocument, word: string): Location[] {
    const text = document.getText();
    const lines = text.split('\n');
    const definitions: Location[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 查找过程定义
        const procMatch = line.match(new RegExp(`^Procedure(?:C|DLL|CDLL)?(?:\\.\\w+)?\\s+(${word})\\s*\\(`, 'i'));
        if (procMatch) {
            const startChar = lines[i].indexOf(procMatch[1]);
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找结构体定义
        const structMatch = line.match(new RegExp(`^Structure\\s+(${word})\\b`, 'i'));
        if (structMatch) {
            const startChar = lines[i].indexOf(structMatch[1]);
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找接口定义
        const interfaceMatch = line.match(new RegExp(`^Interface\\s+(${word})\\b`, 'i'));
        if (interfaceMatch) {
            const startChar = lines[i].indexOf(interfaceMatch[1]);
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找枚举定义
        const enumMatch = line.match(new RegExp(`^Enumeration\\s+(${word})\\b`, 'i'));
        if (enumMatch) {
            const startChar = lines[i].indexOf(enumMatch[1]);
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找模块定义
        const moduleMatch = line.match(new RegExp(`^Module\\s+(${word})\\b`, 'i'));
        if (moduleMatch) {
            const startChar = lines[i].indexOf(moduleMatch[1]);
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找常量定义
        const constMatch = line.match(new RegExp(`^#(${word})\\s*=`, 'i'));
        if (constMatch) {
            const startChar = lines[i].indexOf('#') + 1;
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }

        // 查找变量定义（Global, Protected, Static等）
        const varMatch = line.match(new RegExp(`^(Global|Protected|Static|Define|Dim)\\s+([^\\s,]+\\s+)?\\*?(${word})(?:\\.\\w+|\\[|\\s|$)`, 'i'));
        if (varMatch) {
            const fullLine = lines[i];
            const varName = varMatch[3];
            const startChar = fullLine.indexOf(varName, fullLine.indexOf(varMatch[1]));
            definitions.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: startChar },
                    end: { line: i, character: startChar + word.length }
                }
            });
        }
    }

    return definitions;
}

/**
 * 获取模块符号（函数或常量/结构）调用位置：支持 Module::Name 与 Module::#CONST
 */
function getModuleSymbolFromPosition(text: string, position: Position): { moduleName: string; ident: string } | null {
    const lines = text.split('\n');
    if (position.line >= lines.length) return null;
    const line = lines[position.line];
    const char = position.character;
    const beforeCursor = line.substring(0, char);
    const afterCursor = line.substring(char);
    const full = beforeCursor + afterCursor;
    // 优先匹配常量形式
    let m = full.match(/(\w+)::#(\w+)/);
    if (m) {
        const start = line.indexOf(m[0]);
        const end = start + m[0].length;
        if (char >= start && char <= end) return { moduleName: m[1], ident: m[2] };
    }
    m = full.match(/(\w+)::(\w+)/);
    if (m) {
        const start = line.indexOf(m[0]);
        const end = start + m[0].length;
        if (char >= start && char <= end) return { moduleName: m[1], ident: m[2] };
    }
    return null;
}

/**
 * 查找模块中非函数符号（常量/结构/接口/枚举）定义
 */
function findModuleSymbolDefinition(
    moduleName: string,
    ident: string,
    searchDocs: Map<string, TextDocument>
): Location[] {
    const defs: Location[] = [];
    for (const doc of searchDocs.values()) {
        const text = doc.getText();
        const lines = text.split('\n');
        let inDeclare = false;
        let inModule = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw.trim();
            const dStart = line.match(new RegExp(`^DeclareModule\\s+${moduleName}\\b`, 'i'));
            if (dStart) { inDeclare = true; continue; }
            if (line.match(/^EndDeclareModule\b/i)) { inDeclare = false; continue; }
            const mStart = line.match(new RegExp(`^Module\\s+${moduleName}\\b`, 'i'));
            if (mStart) { inModule = true; continue; }
            if (line.match(/^EndModule\b/i)) { inModule = false; continue; }

            // 在 DeclareModule 中查找常量、结构、接口、枚举名
            if (inDeclare) {
                const constMatch = line.match(new RegExp(`^#(${ident})\\b`, 'i'));
                if (constMatch) {
                    const startChar = raw.indexOf('#' + constMatch[1]) + 1;
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
                const structMatch = line.match(new RegExp(`^Structure\\s+(${ident})\\b`, 'i'));
                if (structMatch) {
                    const startChar = raw.indexOf(structMatch[1]);
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
                const ifaceMatch = line.match(new RegExp(`^Interface\\s+(${ident})\\b`, 'i'));
                if (ifaceMatch) {
                    const startChar = raw.indexOf(ifaceMatch[1]);
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
                const enumMatch = line.match(new RegExp(`^Enumeration\\s+(${ident})\\b`, 'i'));
                if (enumMatch) {
                    const startChar = raw.indexOf(enumMatch[1]);
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
            }

            // 在 Module 中也允许出现常量/结构（较少见，但容错）
            if (inModule) {
                const constMatch = line.match(new RegExp(`^#(${ident})\\b`, 'i'));
                if (constMatch) {
                    const startChar = raw.indexOf('#' + constMatch[1]) + 1;
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
                const structMatch = line.match(new RegExp(`^Structure\\s+(${ident})\\b`, 'i'));
                if (structMatch) {
                    const startChar = raw.indexOf(structMatch[1]);
                    defs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                }
            }
        }
    }
    return defs;
}

/**
 * 结构体成员访问匹配：var\\member（光标位于该片段上）
 */
function getStructAccessFromPosition(text: string, position: Position): { varName: string; memberName: string } | null {
    const lines = text.split('\n');
    if (position.line >= lines.length) return null;
    const line = lines[position.line];
    const char = position.character;

    const re = /([A-Za-z_][A-Za-z0-9_]*|\*[A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\\(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (char >= start && char <= end) {
            return { varName: m[1], memberName: m[2] };
        }
    }
    return null;
}

function normalizeVarName(n: string): string {
    return n.replace(/^\*/, '').replace(/\([^)]*\)$/, '');
}

function getBaseType(typeStr: string): string {
    if (!typeStr) return '';
    const cleaned = typeStr.split(' ')[0];
    const noPtr = cleaned.startsWith('*') ? cleaned.substring(1) : cleaned;
    const arrIdx = noPtr.indexOf('[');
    return arrIdx > -1 ? noPtr.substring(0, arrIdx) : noPtr;
}

/**
 * 在 Structure typeName 内查找成员 memberName 定义位置
 */
function findStructureMemberDefinition(
    typeName: string,
    memberName: string,
    searchDocs: Map<string, TextDocument>
): Location[] {
    const matches: Location[] = [];
    for (const doc of searchDocs.values()) {
        const text = doc.getText();
        const lines = text.split('\n');
        let inStruct = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw.trim();
            if (line.match(new RegExp(`^Structure\\s+${typeName}\\b`, 'i'))) { inStruct = true; continue; }
            if (inStruct && line.match(/^EndStructure\b/i)) { inStruct = false; continue; }
            if (inStruct) {
                const mm = line.match(new RegExp(`^(?:\\*?)(${memberName})\\b`));
                if (mm) {
                    const startChar = raw.indexOf(mm[1]);
                    matches.push({
                        uri: doc.uri,
                        range: {
                            start: { line: i, character: startChar },
                            end: { line: i, character: startChar + mm[1].length }
                        }
                    });
                }
            }
        }
    }
    return matches;
}

/**
 * 收集搜索文档：当前 + 打开 + 递归包含
 */
function collectSearchDocuments(
    document: TextDocument,
    allDocuments: Map<string, TextDocument>,
    maxDepth = 3
): Map<string, TextDocument> {
    const result = new Map<string, TextDocument>();
    const visited = new Set<string>();

    const addDoc = (doc: TextDocument) => {
        if (!result.has(doc.uri)) {
            result.set(doc.uri, doc);
        }
    };

    addDoc(document);
    for (const [, doc] of allDocuments) addDoc(doc);

    const queue: Array<{ uri: string; depth: number }> = [{ uri: document.uri, depth: 0 }];

    while (queue.length) {
        const { uri, depth } = queue.shift()!;
        if (visited.has(uri) || depth > maxDepth) continue;
        visited.add(uri);

        const baseDoc = result.get(uri);
        if (!baseDoc) continue;
        const text = baseDoc.getText();
        const lines = text.split('\n');

        // 维护当前IncludePath搜索目录（最新优先）
        const includeDirs: string[] = [];

        for (const line of lines) {
            // IncludePath 指令
            const ip = line.match(/^\s*IncludePath\s+\"([^\"]+)\"/i);
            if (ip) {
                const dir = normalizeDirPath(uri, ip[1]);
                // 最新的放到前面
                if (!includeDirs.includes(dir)) includeDirs.unshift(dir);
                continue;
            }

            // IncludeFile / XIncludeFile 指令
            const m = line.match(/^\s*(?:X?IncludeFile)\s+\"([^\"]+)\"/i);
            if (!m) continue;
            const inc = m[1];
            const fsPath = resolveIncludePath(uri, inc, includeDirs);
            if (!fsPath) continue;
            const incUri = fsPathToUri(fsPath);
            if (result.has(incUri)) {
                if (!visited.has(incUri)) queue.push({ uri: incUri, depth: depth + 1 });
                continue;
            }
            const opened = allDocuments.get(incUri);
            if (opened) {
                addDoc(opened);
                queue.push({ uri: incUri, depth: depth + 1 });
                continue;
            }
            const content = readFileIfExistsSync(fsPath);
            if (content != null) {
                const tempDoc = TextDocument.create(incUri, 'purebasic', 0, content);
                addDoc(tempDoc);
                queue.push({ uri: incUri, depth: depth + 1 });
            }
        }
    }
    // 增加工作区文件（限制数量），避免遗漏未打开文件
    try {
        const files = getWorkspaceFiles();
        for (const fsPath of files) {
            const incUri = fsPathToUri(fsPath);
            if (result.has(incUri)) continue;
            const content = readFileIfExistsSync(fsPath);
            if (content != null) {
                const tempDoc = TextDocument.create(incUri, 'purebasic', 0, content);
                result.set(incUri, tempDoc);
            }
        }
    } catch {}

    return result;
}
