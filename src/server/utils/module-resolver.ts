/**
 * 模块解析工具
 * 负责解析PureBasic模块和IncludeFile引用
 */

import * as path from 'path';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { resolveIncludePath, readFileIfExistsSync, normalizeDirPath } from './fs-utils';
import { getWorkspaceRootForUri } from '../indexer/workspace-index';
import { readFileCached } from './file-cache';
import { generateHash } from './hash-utils';
import { getErrorHandler } from './error-handler';
import { parsePureBasicConstantDeclaration } from './constants';

export interface ModuleFunction {
    name: string;
    returnType: string;
    parameters: string;
    signature: string;
    insertText: string;
    documentation: string;
}

export interface ModuleInfo {
    name: string;
    functions: ModuleFunction[];
    constants: Array<{name: string, value?: string}>;
    structures: Array<{name: string}>;
    interfaces?: Array<{name: string}>;
    enumerations?: Array<{name: string}>;
}

/**
 * 解析文档中的IncludeFile引用
 */
const includeCache = new WeakMap<TextDocument, { hash: string; files: string[] }>();

export function parseIncludeFiles(document: TextDocument, documentCache: Map<string, TextDocument>): string[] {
    const includeFiles: string[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // 使用文档内容哈希做缓存
    try {
        const h = generateHash(text);
        const cached = includeCache.get(document);
        if (cached && cached.hash === h) {
            return cached.files.slice();
        }
        // 继续解析，完成后写入缓存
        // 注意：下方 return 前会写入缓存
    } catch {}

    // 当前的 IncludePath 列表（最新的优先）
    const includeDirs: string[] = [];
    const workspaceRoot = getWorkspaceRootForUri(document.uri);

    for (const raw of lines) {
        const line = raw.trim();

        // 处理 IncludePath 指令
        const ip = line.match(/^IncludePath\s+\"([^\"]+)\"/i);
        if (ip) {
            const dir = normalizeDirPath(document.uri, ip[1]);
            if (!includeDirs.includes(dir)) includeDirs.unshift(dir);
            continue;
        }

        // 匹配 IncludeFile/XIncludeFile（支持 "..." 或 <...> 语法）
        const m = line.match(/^\s*(?:X?IncludeFile)\s+[\"<]([^\"<>]+)[\">]/i);
        if (!m) continue;

        const inc = m[1];
        // 先按原样解析
        let fullPath = resolveIncludePath(document.uri, inc, includeDirs, workspaceRoot);
        // 若未指定扩展名，尝试追加 .pbi
        if (!fullPath && !path.extname(inc)) {
            fullPath = resolveIncludePath(document.uri, `${inc}.pbi`, includeDirs, workspaceRoot);
        }
        if (fullPath) includeFiles.push(fullPath);
    }

    try {
        const h = generateHash(text);
        includeCache.set(document, { hash: h, files: includeFiles.slice() });
    } catch {}
    return includeFiles;
}

/**
 * 从文件路径读取文档内容
 */
function readDocumentFromPath(filePath: string): string | null {
    try {
        // 优先使用缓存读取（基于 mtime）
        const cached = readFileCached(filePath);
        if (cached != null) return cached;
        return readFileIfExistsSync(filePath);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

/**
 * 解析模块函数补全
 */
export function getModuleFunctionCompletions(
    moduleName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): ModuleFunction[] {
    const functions: ModuleFunction[] = [];

    // 收集所有要搜索的文档
    const searchDocuments: Array<{text: string, uri?: string}> = [];

    // 添加当前文档
    searchDocuments.push({ text: document.getText(), uri: document.uri });

    // 添加缓存中的文档
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) {
            searchDocuments.push({ text: doc.getText(), uri });
        }
    }

    // 解析IncludeFile并添加到搜索文档中
    const includeFiles = parseIncludeFiles(document, documentCache);
    for (const includeFile of includeFiles) {
        const content = readDocumentFromPath(includeFile);
        if (content) {
            searchDocuments.push({ text: content, uri: includeFile });
        }
    }

    // 在所有文档中搜索模块
    for (const doc of searchDocuments) {
        const moduleFunctions = extractModuleFunctions(doc.text, moduleName);
        functions.push(...moduleFunctions);
    }

    // 去重（根据函数名）- 使用 Map 实现 O(n) 复杂度
    const uniqueFunctionsMap = new Map<string, ModuleFunction>();
    for (const func of functions) {
        if (!uniqueFunctionsMap.has(func.name)) {
            uniqueFunctionsMap.set(func.name, func);
        }
    }
    return Array.from(uniqueFunctionsMap.values());
}

/**
 * 获取模块导出（函数/常量/结构）
 */
export function getModuleExports(
    moduleName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): ModuleInfo {
    const info: ModuleInfo = {
        name: moduleName,
        functions: [],
        constants: [],
        structures: [],
        interfaces: [],
        enumerations: []
    };

    // 收集搜索文档
    const searchDocuments: Array<{text: string, uri?: string}> = [];
    searchDocuments.push({ text: document.getText(), uri: document.uri });
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) {
            searchDocuments.push({ text: doc.getText(), uri });
        }
    }

    const includeFiles = parseIncludeFiles(document, documentCache);
    for (const includeFile of includeFiles) {
        const content = readDocumentFromPath(includeFile);
        if (content) {
            searchDocuments.push({ text: content, uri: includeFile });
        }
    }

    for (const doc of searchDocuments) {
        const mod = extractModuleExports(doc.text, moduleName);
        // 合并，按名称去重
        for (const f of mod.functions) {
            if (!info.functions.some(x => x.name === f.name)) info.functions.push(f);
        }
        for (const c of mod.constants) {
            if (!info.constants.some(x => x.name === c.name)) info.constants.push(c);
        }
        for (const s of mod.structures) {
            if (!info.structures.some(x => x.name === s.name)) info.structures.push(s);
        }
        for (const s of (mod.interfaces || [])) {
            if (!info.interfaces!.some(x => x.name === s.name)) info.interfaces!.push(s);
        }
        for (const e of (mod.enumerations || [])) {
            if (!info.enumerations!.some(x => x.name === e.name)) info.enumerations!.push(e);
        }
    }

    return info;
}

/**
 * 从文档文本中提取指定模块的函数
 */
function extractModuleFunctions(text: string, moduleName: string): ModuleFunction[] {
    const functions: ModuleFunction[] = [];
    const lines = text.split('\n');

    let inDeclareModule = false;
    let inModule = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 检查DeclareModule开始
        const declareModuleMatch = line.match(new RegExp(`^DeclareModule\\s+${moduleName}\\b`, 'i'));
        if (declareModuleMatch) {
            inDeclareModule = true;
            continue;
        }

        // 检查Module开始
        const moduleStartMatch = line.match(new RegExp(`^Module\\s+${moduleName}\\b`, 'i'));
        if (moduleStartMatch) {
            inModule = true;
            continue;
        }

        // 检查模块结束
        if (line.match(/^EndDeclareModule\b/i)) {
            inDeclareModule = false;
            continue;
        }

        if (line.match(/^EndModule\b/i)) {
            inModule = false;
            continue;
        }

        // 在DeclareModule中查找Declare声明
        if (inDeclareModule) {
            const declareMatch = line.match(/^Declare(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
            if (declareMatch) {
                const returnType = declareMatch[1] || '';
                const functionName = declareMatch[2];
                const params = declareMatch[3] || '';

                const signature = returnType
                    ? `Declare.${returnType} ${functionName}(${params})`
                    : `Declare ${functionName}(${params})`;

                const insertText = params.trim() ? `${functionName}(` : `${functionName}()`;

                functions.push({
                    name: functionName,
                    returnType,
                    parameters: params,
                    signature,
                    insertText,
                    documentation: `Module function declaration: ${signature}`
                });
            }
        }

        // 在Module中查找Procedure定义
        if (inModule) {
            const procMatch = line.match(/^Procedure(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
            if (procMatch) {
                const returnType = procMatch[1] || '';
                const functionName = procMatch[2];
                const params = procMatch[3] || '';

                const signature = returnType
                    ? `Procedure.${returnType} ${functionName}(${params})`
                    : `Procedure ${functionName}(${params})`;

                const insertText = params.trim() ? `${functionName}(` : `${functionName}()`;

                functions.push({
                    name: functionName,
                    returnType,
                    parameters: params,
                    signature,
                    insertText,
                    documentation: `Module function implementation: ${signature}`
                });
            }
        }
    }

    return functions;
}

/**
 * 提取模块导出（声明部分与实现部分）
 */
function extractModuleExports(text: string, moduleName: string): {
    functions: ModuleFunction[];
    constants: Array<{name: string, value?: string}>;
    structures: Array<{name: string}>;
    interfaces?: Array<{name: string}>;
    enumerations?: Array<{name: string}>;
} {
    const functions: ModuleFunction[] = [];
    const constants: Array<{name: string, value?: string}> = [];
    const structures: Array<{name: string}> = [];
    const interfaces: Array<{name: string}> = [];
    const enumerations: Array<{name: string}> = [];

    const lines = text.split('\n');
    let inDeclareModule = false;
    let inModule = false;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();

        // 声明和实现范围
        const declStart = line.match(new RegExp(`^DeclareModule\\s+${moduleName}\\b`, 'i'));
        if (declStart) { inDeclareModule = true; continue; }
        if (line.match(/^EndDeclareModule\b/i)) { inDeclareModule = false; continue; }

        const modStart = line.match(new RegExp(`^Module\\s+${moduleName}\\b`, 'i'));
        if (modStart) { inModule = true; continue; }
        if (line.match(/^EndModule\b/i)) { inModule = false; continue; }

        // 声明区：导出函数声明、常量、结构定义
        if (inDeclareModule) {
            const declareMatch = line.match(/^Declare(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
            if (declareMatch) {
                const returnType = declareMatch[1] || '';
                const functionName = declareMatch[2];
                const params = declareMatch[3] || '';
                const signature = returnType
                    ? `Declare.${returnType} ${functionName}(${params})`
                    : `Declare ${functionName}(${params})`;
                const insertText = params.trim() ? `${functionName}(` : `${functionName}()`;
                functions.push({
                    name: functionName,
                    returnType,
                    parameters: params,
                    signature,
                    insertText,
                    documentation: `Module function declaration: ${signature}`
                });
                continue;
            }

            const constMatch = parsePureBasicConstantDeclaration(line);
            if (constMatch) {
                constants.push({ name: constMatch.name, value: constMatch.value });
                continue;
            }

            const structMatch = line.match(/^Structure\s+(\w+)/i);
            if (structMatch) {
                structures.push({ name: structMatch[1] });
                continue;
            }

            const interfaceMatch = line.match(/^Interface\s+(\w+)/i);
            if (interfaceMatch) {
                interfaces.push({ name: interfaceMatch[1] });
                continue;
            }

            const enumMatch = line.match(/^Enumeration\s+(\w+)/i);
            if (enumMatch) {
                enumerations.push({ name: enumMatch[1] });
                continue;
            }
        }

        // 实现区：收集实际实现（补全函数参数/返回值）
        if (inModule) {
            const procMatch = line.match(/^Procedure(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
            if (procMatch) {
                const returnType = procMatch[1] || '';
                const functionName = procMatch[2];
                const params = procMatch[3] || '';
                const signature = returnType
                    ? `Procedure.${returnType} ${functionName}(${params})`
                    : `Procedure ${functionName}(${params})`;
                const insertText = params.trim() ? `${functionName}(` : `${functionName}()`;
                // 覆盖/补充同名声明
                const idx = functions.findIndex(f => f.name === functionName);
                const item = {
                    name: functionName,
                    returnType,
                    parameters: params,
                    signature,
                    insertText,
                    documentation: `Module function implementation: ${signature}`
                } as ModuleFunction;
                if (idx >= 0) functions[idx] = item; else functions.push(item);
            }
        }
    }

    return { functions, constants, structures, interfaces, enumerations };
}

/**
 * 获取所有可用的模块
 */
export function getAvailableModules(
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): string[] {
    const modules: Set<string> = new Set();
    const searchDocuments: Array<{text: string}> = [];

    // 添加当前文档
    searchDocuments.push({ text: document.getText() });

    // 添加缓存中的文档
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) {
            searchDocuments.push({ text: doc.getText() });
        }
    }

    // 解析IncludeFile并添加到搜索文档中
    const includeFiles = parseIncludeFiles(document, documentCache);
    for (const includeFile of includeFiles) {
        const content = readDocumentFromPath(includeFile);
        if (content) {
            searchDocuments.push({ text: content });
        }
    }

    // 在所有文档中搜索模块
    for (const doc of searchDocuments) {
        const foundModules = extractModuleNames(doc.text);
        foundModules.forEach(m => modules.add(m));
    }

    return Array.from(modules);
}

/**
 * 从文档文本中提取模块名称
 */
function extractModuleNames(text: string): string[] {
    const modules: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();

        // 匹配 DeclareModule ModuleName
        const declareMatch = trimmedLine.match(/^DeclareModule\s+(\w+)/i);
        if (declareMatch) {
            modules.push(declareMatch[1]);
        }

        // 匹配 Module ModuleName
        const moduleMatch = trimmedLine.match(/^Module\s+(\w+)/i);
        if (moduleMatch) {
            modules.push(moduleMatch[1]);
        }
    }

    return modules;
}
