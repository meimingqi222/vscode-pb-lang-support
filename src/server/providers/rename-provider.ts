/**
 * 重命名提供者
 * 为PureBasic提供符号重命名功能
 */

import {
    RenameParams,
    WorkspaceEdit,
    TextEdit,
    PrepareRenameParams,
    Range,
    Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { analyzeScopesAndVariables } from '../utils/scope-manager';

/**
 * 准备重命名 - 检查是否可以重命名
 */
export function handlePrepareRename(
    params: PrepareRenameParams,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): Range | { range: Range; placeholder: string } | null {
    const position = params.position;
    const text = document.getText();
    const lines = text.split('\n');

    if (position.line >= lines.length) {
        return null;
    }

    const line = lines[position.line];
    const word = getWordAtPosition(line, position.character);

    if (!word) {
        return null;
    }

    // 检查是否是可重命名的符号
    if (isRenameableSymbol(word, document, documentCache, position)) {
        const range = getWordRange(line, position.character);
        return {
            range,
            placeholder: word
        };
    }

    // 结构体成员：var\\member 的成员名重命名
    const structLoc = getStructAccessFromLine(line, position.character);
    if (structLoc) {
        const structName = getVariableStructureAt(document, position.line, structLoc.varName);
        if (structName) {
            const range = getMemberRange(line, position.character, structLoc.memberName, position.line);
            if (range) {
                return { range, placeholder: structLoc.memberName };
            }
        }
    }

    return null;
}

/**
 * 执行重命名
 */
export function handleRename(
    params: RenameParams,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): WorkspaceEdit | null {
    const position = params.position;
    const newName = params.newName;
    const text = document.getText();
    const lines = text.split('\n');

    if (position.line >= lines.length) {
        return null;
    }

    const line = lines[position.line];
    const oldName = getWordAtPosition(line, position.character);

    if (!oldName || !isValidIdentifier(newName)) {
        return null;
    }

    // 检查是否是模块调用
    const moduleMatch = getModuleCallFromPosition(line, position.character);
    if (moduleMatch) {
        return handleModuleFunctionRename(
            moduleMatch.moduleName,
            moduleMatch.functionName,
            newName,
            document,
            documentCache
        );
    }

    // 结构体成员重命名
    const structLoc2 = getStructAccessFromLine(line, position.character);
    if (structLoc2) {
        const structName = getVariableStructureAt(document, position.line, structLoc2.varName);
        if (structName) {
            return handleStructMemberRename(structName, structLoc2.memberName, newName, document, documentCache);
        }
    }

    // 模块符号（非函数）重命名：Module::Name / Module::#CONST
    const modSym = getModuleSymbolFromLine(line, position.character);
    if (modSym) {
        return handleModuleSymbolRename(
            modSym.moduleName,
            modSym.ident,
            newName,
            document,
            documentCache
        );
    }

    // 常规符号重命名
    const edits = findAllOccurrences(oldName, document, documentCache);

    if (edits.length === 0) {
        return null;
    }

    // 将编辑按文档URI分组
    const changes: { [uri: string]: TextEdit[] } = {};
    for (const edit of edits) {
        if (!changes[edit.uri]) {
            changes[edit.uri] = [];
        }
        changes[edit.uri].push({
            range: edit.range,
            newText: newName
        });
    }

    return { changes };
}

/**
 * 获取位置处的单词
 */
function getWordAtPosition(line: string, character: number): string | null {
    let start = character;
    let end = character;

    // 向前查找单词开始
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
        start--;
    }

    // 向后查找单词结束
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
        end++;
    }

    if (start === end) {
        return null;
    }

    return line.substring(start, end);
}

/**
 * 获取单词的范围
 */
function getWordRange(line: string, character: number): Range {
    let start = character;
    let end = character;

    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
        start--;
    }

    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
        end++;
    }

    return {
        start: { line: 0, character: start },
        end: { line: 0, character: end }
    };
}

/**
 * 检查是否是有效的标识符
 */
function isValidIdentifier(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * 检查是否是可重命名的符号
 */
function isRenameableSymbol(
    word: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>,
    position: Position
): boolean {
    // 不允许重命名关键字
    const keywords = [
        'If', 'EndIf', 'Else', 'ElseIf', 'For', 'Next', 'While', 'Wend',
        'Repeat', 'Until', 'Select', 'Case', 'Default', 'EndSelect',
        'Procedure', 'EndProcedure', 'Declare', 'Structure', 'EndStructure',
        'Module', 'EndModule', 'Global', 'Protected', 'Static', 'Define',
        'Integer', 'String', 'Float', 'Double', 'Byte', 'Word', 'Long',
        'Quad', 'Character', 'Ascii', 'Unicode'
    ];

    if (keywords.some(kw => kw.toLowerCase() === word.toLowerCase())) {
        return false;
    }

    // 检查是否是用户定义的符号
    return isUserDefinedSymbol(word, document, documentCache, position);
}

/**
 * 检查是否是用户定义的符号
 */
function isUserDefinedSymbol(
    word: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>,
    position: Position
): boolean {
    const searchDocuments = [document, ...Array.from(documentCache.values())];

    for (const doc of searchDocuments) {
        const text = doc.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 检查过程定义
            const procMatch = line.match(new RegExp(`^Procedure(?:\\.\\w+)?\\s+(${word})\\s*\\(`, 'i'));
            if (procMatch) {
                return true;
            }

            // 检查变量定义
            const varMatch = line.match(new RegExp(`^(Global|Protected|Static|Define|Dim)\\s+(?:\\w+\\s+)?(\\*?${word})(?:\\.\\w+)?`, 'i'));
            if (varMatch) {
                return true;
            }

            // 检查常量定义
            const constMatch = line.match(new RegExp(`^#(${word})\\s*=`, 'i'));
            if (constMatch) {
                return true;
            }

            // 检查结构体定义
            const structMatch = line.match(new RegExp(`^Structure\\s+(${word})\\b`, 'i'));
            if (structMatch) {
                return true;
            }

            // 检查模块定义
            const moduleMatch = line.match(new RegExp(`^Module\\s+(${word})\\b`, 'i'));
            if (moduleMatch) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 获取模块调用信息
 */
function getModuleCallFromPosition(line: string, character: number): {
    moduleName: string;
    functionName: string;
} | null {
    const beforeCursor = line.substring(0, character);
    const afterCursor = line.substring(character);
    const fullContext = beforeCursor + afterCursor;

    const moduleMatch = fullContext.match(/(\w+)::(\w+)/);
    if (moduleMatch) {
        const matchStart = line.indexOf(moduleMatch[0]);
        const matchEnd = matchStart + moduleMatch[0].length;

        if (character >= matchStart && character <= matchEnd) {
            return {
                moduleName: moduleMatch[1],
                functionName: moduleMatch[2]
            };
        }
    }

    return null;
}

/**
 * 处理模块函数重命名
 */
function handleModuleFunctionRename(
    moduleName: string,
    functionName: string,
    newName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): WorkspaceEdit | null {
    const edits: Array<{ uri: string; range: Range }> = [];
    const searchDocuments = [document, ...Array.from(documentCache.values())];

    for (const doc of searchDocuments) {
        const text = doc.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 查找模块调用 Module::Function
            const moduleCallRegex = new RegExp(`\\b${moduleName}::${functionName}\\b`, 'gi');
            let match;
            while ((match = moduleCallRegex.exec(line)) !== null) {
                const functionStart = match.index + moduleName.length + 2; // +2 for '::'
                edits.push({
                    uri: doc.uri,
                    range: {
                        start: { line: i, character: functionStart },
                        end: { line: i, character: functionStart + functionName.length }
                    }
                });
            }

            // 查找模块内的函数定义
            let inModule = false;
            const moduleStartMatch = line.match(new RegExp(`^\\s*Module\\s+${moduleName}\\b`, 'i'));
            if (moduleStartMatch) {
                inModule = true;
            }

            if (line.match(/^\s*EndModule\b/i)) {
                inModule = false;
            }

            if (inModule) {
                const procMatch = line.match(new RegExp(`^\\s*Procedure(?:\\.\\w+)?\\s+(${functionName})\\s*\\(`, 'i'));
                if (procMatch) {
                    const startChar = line.indexOf(procMatch[1]);
                    edits.push({
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

    if (edits.length === 0) {
        return null;
    }

    // 将编辑按文档URI分组
    const changes: { [uri: string]: TextEdit[] } = {};
    for (const edit of edits) {
        if (!changes[edit.uri]) {
            changes[edit.uri] = [];
        }
        changes[edit.uri].push({
            range: edit.range,
            newText: newName
        });
    }

    return { changes };
}

/**
 * 查找所有出现位置
 */
function findAllOccurrences(
    word: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): Array<{ uri: string; range: Range }> {
    const occurrences: Array<{ uri: string; range: Range }> = [];
    const searchDocuments = [document, ...Array.from(documentCache.values())];

    for (const doc of searchDocuments) {
        const text = doc.getText();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 使用单词边界匹配
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            let match;
            while ((match = regex.exec(line)) !== null) {
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

                occurrences.push({
                    uri: doc.uri,
                    range: {
                        start: { line: i, character: match.index },
                        end: { line: i, character: match.index + word.length }
                    }
                });
            }
        }
    }

    return occurrences;
}

/**
 * 处理模块符号（常量/结构/接口/枚举）重命名
 */
function handleModuleSymbolRename(
    moduleName: string,
    ident: string,
    newName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): WorkspaceEdit | null {
    const changes: { [uri: string]: TextEdit[] } = {};
    const searchDocuments = [document, ...Array.from(documentCache.values())];

    for (const doc of searchDocuments) {
        const text = doc.getText();
        const lines = text.split('\n');
        const edits: TextEdit[] = [];

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();

            // 使用处：Module::ident / Module::#ident
            const re = new RegExp(`\\b${moduleName}::#?${ident}\\b`, 'g');
            let m: RegExpExecArray | null;
            while ((m = re.exec(raw)) !== null) {
                const identStart = m.index + moduleName.length + 2 + (raw[m.index + moduleName.length + 2] === '#' ? 1 : 0);
                edits.push({ range: { start: { line: i, character: identStart }, end: { line: i, character: identStart + ident.length } }, newText: newName });
            }

            // 声明：Structure/Interface/Enumeration/常量名
            const defMatchers = [
                new RegExp(`^Structure\\s+(${ident})\\b`, 'i'),
                new RegExp(`^Interface\\s+(${ident})\\b`, 'i'),
                new RegExp(`^Enumeration\\s+(${ident})\\b`, 'i'),
                new RegExp(`^#(${ident})\\b`, 'i')
            ];
            for (const r of defMatchers) {
                const mm = trimmed.match(r);
                if (mm) {
                    const startChar = raw.indexOf(mm[1]);
                    edits.push({ range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + ident.length } }, newText: newName });
                    break;
                }
            }
        }

        if (edits.length) {
            changes[doc.uri] = (changes[doc.uri] || []).concat(edits);
        }
    }

    return Object.keys(changes).length ? { changes } : null;
}

/**
 * 获取模块符号位置（常量/结构/接口/枚举）
 */
function getModuleSymbolFromLine(line: string, character: number): { moduleName: string; ident: string } | null {
    const before = line.substring(0, character);
    const after = line.substring(character);
    const full = before + after;
    let m = full.match(/(\w+)::#(\w+)/);
    if (m) {
        const start = line.indexOf(m[0]);
        const end = start + m[0].length;
        if (character >= start && character <= end) return { moduleName: m[1], ident: m[2] };
    }
    m = full.match(/(\w+)::(\w+)/);
    if (m) {
        const start = line.indexOf(m[0]);
        const end = start + m[0].length;
        if (character >= start && character <= end) return { moduleName: m[1], ident: m[2] };
    }
    return null;
}

/**
 * 结构体成员位置：var\\member
 */
function getStructAccessFromLine(line: string, character: number): { varName: string; memberName: string } | null {
    const re = /([A-Za-z_][A-Za-z0-9_]*|\*[A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\\(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (character >= start && character <= end) {
            return { varName: m[1], memberName: m[2] };
        }
    }
    return null;
}

function getVariableStructureAt(document: TextDocument, lineNumber: number, varName: string): string | null {
    const text = document.getText();
    const analysis = analyzeScopesAndVariables(text, lineNumber);
    const normalized = varName.replace(/^\*/, '').replace(/\([^)]*\)$/, '');
    const v = analysis.availableVariables.find(x => x.name.toLowerCase() === normalized.toLowerCase());
    if (!v) return null;
    const t = v.type || '';
    const cleaned = t.split(' ')[0];
    const noPtr = cleaned.startsWith('*') ? cleaned.substring(1) : cleaned;
    const arrIdx = noPtr.indexOf('[');
    return (arrIdx > -1 ? noPtr.substring(0, arrIdx) : noPtr) || null;
}

function getMemberRange(line: string, character: number, memberName: string, lineNo: number): Range | null {
    const re = new RegExp(`\\\\(${memberName})\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        const start = m.index + 1; // skip '\\'
        const end = start + m[1].length;
        if (character >= start && character <= end) {
            return {
                start: { line: lineNo, character: start },
                end: { line: lineNo, character: end }
            };
        }
    }
    return null;
}

/**
 * 处理结构体成员重命名
 */
function handleStructMemberRename(
    structName: string,
    memberName: string,
    newName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): WorkspaceEdit | null {
    const changes: { [uri: string]: TextEdit[] } = {};
    const searchDocuments = [document, ...Array.from(documentCache.values())];

    // 收集各文档内属于该结构体的变量名
    const structVarsPerDoc = new Map<string, string[]>();
    for (const doc of searchDocuments) {
        const analysis = analyzeScopesAndVariables(doc.getText(), Number.MAX_SAFE_INTEGER);
        const vars = analysis.availableVariables
            .filter(v => {
                const t = v.type || '';
                const cleaned = t.split(' ')[0];
                const noPtr = cleaned.startsWith('*') ? cleaned.substring(1) : cleaned;
                const arrIdx = noPtr.indexOf('[');
                const base = arrIdx > -1 ? noPtr.substring(0, arrIdx) : noPtr;
                return base.toLowerCase() === structName.toLowerCase();
            })
            .map(v => v.name);
        structVarsPerDoc.set(doc.uri, vars);
    }

    for (const doc of searchDocuments) {
        const text = doc.getText();
        const lines = text.split('\n');
        const edits: TextEdit[] = [];

        // 1) 修改结构体定义内的成员名
        let inStruct = false;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw.trim();
            if (line.match(new RegExp(`^Structure\\s+${structName}\\b`, 'i'))) { inStruct = true; continue; }
            if (inStruct && line.match(/^EndStructure\b/i)) { inStruct = false; continue; }
            if (inStruct) {
                const mm = line.match(new RegExp(`^(?:\\*?)(${memberName})(?:\\.|\\s|$)`));
                if (mm) {
                    const startChar = raw.indexOf(mm[1]);
                    edits.push({ range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + memberName.length } }, newText: newName });
                }
            }
        }

        // 2) 修改使用处：var\\memberName，支持 *var 与 var(...) 形式
        const vars = structVarsPerDoc.get(doc.uri) || [];
        if (vars.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                for (const v of vars) {
                    const re = new RegExp(`\\b\\*?${v}(?:\\([^)]*\\))?\\\\${memberName}\\b`, 'g');
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(raw)) !== null) {
                        // 计算成员名起始：在匹配片段内找到第一个反斜杠位置
                        const matchStart = m.index;
                        const matchedText = raw.substring(matchStart, matchStart + m[0].length);
                        const slashRel = matchedText.indexOf('\\');
                        const startChar = matchStart + slashRel + 1;
                        edits.push({ range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + memberName.length } }, newText: newName });
                    }
                }
            }
        }

        if (edits.length > 0) {
            changes[doc.uri] = (changes[doc.uri] || []).concat(edits);
        }
    }

    return Object.keys(changes).length ? { changes } : null;
}
