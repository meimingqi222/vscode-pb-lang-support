/**
 * 引用提供者
 * 为PureBasic提供查找引用功能
 */

import {
    ReferenceParams,
    Location,
    Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { readFileIfExistsSync, resolveIncludePath, fsPathToUri, normalizeDirPath } from '../utils/fs-utils';
import { getWorkspaceFiles, getWorkspaceRootForUri } from '../indexer/workspace-index';
import { parsePureBasicConstantDefinition, parsePureBasicConstantDeclaration } from '../utils/constants';

/**
 * 处理引用请求
 */
export function handleReferences(
    params: ReferenceParams,
    document: TextDocument,
    allDocuments: Map<string, TextDocument>
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

    // 查找引用
    const references: Location[] = [];

    // 处理模块调用语法（函数）
    const moduleMatch = getModuleFunctionFromPosition(text, position);
    if (moduleMatch) {
        // 查找模块函数的所有引用
        const moduleReferences = findModuleFunctionReferences(
            moduleMatch.moduleName,
            moduleMatch.functionName,
            searchDocs,
            params.context.includeDeclaration
        );
        references.push(...moduleReferences);
    } else {
        // 处理模块符号（常量/结构/接口/枚举）：Module::Name 或 Module::#CONST
        const modSym = getModuleSymbolFromPosition(text, position);
        if (modSym) {
            const modSymRefs = findModuleSymbolReferences(
                modSym.moduleName,
                modSym.ident,
                searchDocs,
                params.context.includeDeclaration
            );
            references.push(...modSymRefs);
            return references;
        }
        // 常规引用查找：遍历所有搜索文档
        for (const doc of searchDocs.values()) {
            const docReferences = findReferencesInDocument(doc, word, params.context.includeDeclaration);
            references.push(...docReferences);
        }
    }

    return references;
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
 * 查找模块函数的所有引用
 */
function findModuleFunctionReferences(
    moduleName: string,
    functionName: string,
    searchDocs: Map<string, TextDocument>,
    includeDeclaration: boolean
): Location[] {
    const references: Location[] = [];
    for (const doc of searchDocs.values()) {
        const text = doc.getText();
        const lines = text.split('\n');
        let inModule = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 查找模块调用 Module::Function
            const moduleCallRegex = new RegExp(`\\b${escapeRegExp(moduleName)}::${escapeRegExp(functionName)}\\b`, 'gi');
            let match;
            while ((match = moduleCallRegex.exec(line)) !== null) {
                // 跳过注释中的匹配
                if (line.substring(0, match.index).includes(';')) {
                    continue;
                }

                // 跳过字符串中的匹配
                const beforeMatch = line.substring(0, match.index);
                const quoteCount = (beforeMatch.match(/"/g) || []).length;
                if (quoteCount % 2 === 1) {
                    continue;
                }

                references.push({
                    uri: doc.uri,
                    range: {
                        start: { line: i, character: match.index },
                        end: { line: i, character: match.index + match[0].length }
                    }
                });
            }

            // 如果包含声明，在模块内查找函数定义
            if (includeDeclaration) {
                // 检查模块开始
                const moduleStartMatch = line.match(new RegExp(`^\\s*Module\\s+${escapeRegExp(moduleName)}\\b`, 'i'));
                if (moduleStartMatch) {
                    inModule = true;
                    continue;
                }

                // 检查模块结束
                if (line.match(/^\s*EndModule\b/i)) {
                    inModule = false;
                    continue;
                }

                // 在模块内查找过程定义
                if (inModule) {
                    const procMatch = line.match(new RegExp(`^\\s*Procedure(?:\\.\\w+)?\\s+(${escapeRegExp(functionName)})\\s*\\(`, 'i'));
                    if (procMatch) {
                        const startChar = line.indexOf(procMatch[1]);
                        references.push({
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
    }

    return references;
}

/**
 * 在文档中查找引用
 */
function findReferencesInDocument(
    document: TextDocument,
    word: string,
    includeDeclaration: boolean
): Location[] {
    const escapedWord = escapeRegExp(word);
    const text = document.getText();
    const lines = text.split('\n');
    const references: Location[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 如果包含声明，查找定义
        if (includeDeclaration) {
            // 查找过程定义
            const procMatch = trimmedLine.match(new RegExp(`^Procedure(?:\\.\\w+)?\\s+(${escapedWord})\\s*\\(`, 'i'));
            if (procMatch) {
                const startChar = line.indexOf(procMatch[1]);
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + word.length }
                    }
                });
            }

            // 查找结构体定义
            const structMatch = trimmedLine.match(new RegExp(`^Structure\\s+(${escapedWord})\\b`, 'i'));
            if (structMatch) {
                const startChar = line.indexOf(structMatch[1]);
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + word.length }
                    }
                });
            }

            // 查找接口定义
            const ifaceMatch = trimmedLine.match(new RegExp(`^Interface\\s+(${escapedWord})\\b`, 'i'));
            if (ifaceMatch) {
                const startChar = line.indexOf(ifaceMatch[1]);
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + word.length }
                    }
                });
            }

            // 查找枚举定义
            const enumMatch = trimmedLine.match(new RegExp(`^Enumeration\\s+(${escapedWord})\\b`, 'i'));
            if (enumMatch) {
                const startChar = line.indexOf(enumMatch[1]);
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + word.length }
                    }
                });
            }

            // 查找常量定义
            const constMatch = parsePureBasicConstantDefinition(trimmedLine) || parsePureBasicConstantDeclaration(trimmedLine);
            if (constMatch && normalizeConstantName(constMatch.name) === normalizeConstantName(word)) {
                const constIndex = line.indexOf('#' + constMatch.name);
                if (constIndex === -1) continue;
                const startChar = constIndex + 1;
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + constMatch.name.length }
                    }
                });
            }

            // 查找变量定义
            const varMatch = trimmedLine.match(new RegExp(`^(Global|Protected|Static|Define|Dim)\\s+([^\\s,]+\\s+)?\\*?(${escapedWord})(?:\\.\\w+|\\[|\\s|$)`, 'i'));
            if (varMatch) {
                const varName = varMatch[3];
                const startChar = line.indexOf(varName, line.indexOf(varMatch[1]));
                references.push({
                    uri: document.uri,
                    range: {
                        start: { line: i, character: startChar },
                        end: { line: i, character: startChar + word.length }
                    }
                });
            }
        }

        // 查找使用/引用 - 转义 word 防止正则注入
        const wordRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
        let match;
        while ((match = wordRegex.exec(line)) !== null) {
            // 跳过注释中的匹配
            if (line.substring(0, match.index).includes(';')) {
                continue;
            }

            // 跳过字符串中的匹配
            const beforeMatch = line.substring(0, match.index);
            const quoteCount = (beforeMatch.match(/"/g) || []).length;
            if (quoteCount % 2 === 1) {
                continue;
            }

            references.push({
                uri: document.uri,
                range: {
                    start: { line: i, character: match.index },
                    end: { line: i, character: match.index + word.length }
                }
            });
        }
    }

    return references;
}

/**
 * 获取模块符号（函数以外，如常量/结构/接口/枚举）的调用位置
 */
function getModuleSymbolFromPosition(text: string, position: Position): { moduleName: string; ident: string } | null {
    const lines = text.split('\n');
    if (position.line >= lines.length) return null;
    const line = lines[position.line];
    const char = position.character;
    const before = line.substring(0, char);
    const after = line.substring(char);
    const full = before + after;
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
 * 查找模块中的常量/结构/接口/枚举引用
 */
function findModuleSymbolReferences(
    moduleName: string,
    ident: string,
    searchDocs: Map<string, TextDocument>,
    includeDeclaration: boolean
): Location[] {
    const refs: Location[] = [];
    const escapedModuleName = escapeRegExp(moduleName);
    const escapedIdent = escapeRegExp(ident);

    for (const doc of searchDocs.values()) {
        const text = doc.getText();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            // Module::ident 或 Module::#ident
            const re = new RegExp(`\\b${escapedModuleName}::#?${escapedIdent}\\b`, 'g');
            let m: RegExpExecArray | null;
            while ((m = re.exec(raw)) !== null) {
                // 跳过注释/字符串
                const before = raw.substring(0, m.index);
                if (before.includes(';')) continue;
                const quoteCount = (before.match(/\"/g) || []).length;
                if (quoteCount % 2 === 1) continue;
                refs.push({ uri: doc.uri, range: { start: { line: i, character: m.index + moduleName.length + 2 + (raw[m.index + moduleName.length + 2] === '#' ? 1 : 0) }, end: { line: i, character: m.index + m[0].length } } });
            }

            if (!includeDeclaration) continue;
            // 声明区内的定义（DeclareModule / Module）
            const trimmed = raw.trim();
            const constMatch = parsePureBasicConstantDefinition(trimmed) || parsePureBasicConstantDeclaration(trimmed);
            if (constMatch && normalizeConstantName(constMatch.name) === normalizeConstantName(ident)) {
                const constIndex = raw.indexOf('#' + constMatch.name);
                if (constIndex === -1) continue;
                const startChar = constIndex + 1;
                refs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + constMatch.name.length } } });
                continue;
            }
            const defMatchers = [
                new RegExp(`^Structure\\s+(${escapedIdent})\\b`, 'i'),
                new RegExp(`^Interface\\s+(${escapedIdent})\\b`, 'i'),
                new RegExp(`^Enumeration\\s+(${escapedIdent})\\b`, 'i')
            ];
            for (const r of defMatchers) {
                const mm = trimmed.match(r);
                if (mm) {
                    const startChar = raw.indexOf(mm[1]);
                    refs.push({ uri: doc.uri, range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } } });
                    break;
                }
            }
        }
    }
    return refs;
}

function normalizeConstantName(name: string): string {
    return name.replace(/[.$@]+$/, '').toLowerCase();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * 收集搜索文档：当前 + 打开 + 递归包含
 */
function collectSearchDocuments(
    document: TextDocument,
    allDocuments: Map<string, TextDocument>,
    maxDepth = 3
): Map<string, TextDocument> {
    const workspaceRoot = getWorkspaceRootForUri(document.uri);
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
                if (!includeDirs.includes(dir)) includeDirs.unshift(dir);
                continue;
            }

            const m = line.match(/^\s*(?:X?IncludeFile)\s+\"([^\"]+)\"/i);
            if (!m) continue;
            const inc = m[1];
            const fsPath = resolveIncludePath(uri, inc, includeDirs, workspaceRoot);
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
    // 加入工作区文件（有限制），用于更完整的引用搜索
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
