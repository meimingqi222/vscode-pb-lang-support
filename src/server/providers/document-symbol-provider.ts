/**
 * 文档符号提供者
 * 为PureBasic提供文档大纲和符号导航功能
 */

import {
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolKind,
    Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * 处理文档符号请求
 */
export function handleDocumentSymbol(
    params: DocumentSymbolParams,
    document: TextDocument
): DocumentSymbol[] {
    const text = document.getText();
    const lines = text.split('\n');
    const symbols: DocumentSymbol[] = [];

    let currentModule: DocumentSymbol | null = null;
    let currentStructure: DocumentSymbol | null = null;
    let currentProcedure: DocumentSymbol | null = null;
    let currentEnumeration: DocumentSymbol | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine === '' || trimmedLine.startsWith(';')) {
            continue;
        }

        // 模块定义
        const moduleMatch = trimmedLine.match(/^Module\s+(\w+)\b/i);
        if (moduleMatch) {
            const name = moduleMatch[1];
            const nameStart = Math.max(0, line.indexOf(name));
            const selectionRange = createRange(i, nameStart, name.length);
            const blockRange: Range = {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
            };

            // 检查是否是单行模块 (Module ... : EndModule)
            const isSingleLine = trimmedLine.includes(':') && trimmedLine.includes('EndModule');

            if (isSingleLine) {
                // 单行模块直接添加到符号列表，不设置currentModule
                const singleLineModule: DocumentSymbol = {
                    name,
                    kind: SymbolKind.Module,
                    range: blockRange,
                    selectionRange,
                    children: []
                };
                symbols.push(singleLineModule);
            } else {
                // 多行模块设置currentModule
                currentModule = {
                    name,
                    kind: SymbolKind.Module,
                    range: blockRange,
                    selectionRange,
                    children: []
                };
                symbols.push(currentModule);
            }
            continue;
        }

        // 模块结束
        if (trimmedLine.match(/^EndModule\b/i)) {
            currentModule = null;
            continue;
        }

        // 结构体定义
        const structMatch = trimmedLine.match(/^Structure\s+(\w+)\b/i);
        if (structMatch) {
            const name = structMatch[1];
            const nameStart = Math.max(0, line.indexOf(name));
            const selectionRange = createRange(i, nameStart, name.length);
            const blockRange: Range = {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
            };

            const structSymbol: DocumentSymbol = {
                name,
                kind: SymbolKind.Struct,
                range: blockRange,
                selectionRange,
                children: []
            };

            if (currentModule) {
                currentModule.children!.push(structSymbol);
            } else {
                symbols.push(structSymbol);
            }
            currentStructure = structSymbol;
            continue;
        }

        // 结构体结束
        if (trimmedLine.match(/^EndStructure\b/i)) {
            currentStructure = null;
            continue;
        }

        // 接口定义
        const interfaceMatch = trimmedLine.match(/^Interface\s+(\w+)\b/i);
        if (interfaceMatch) {
            const name = interfaceMatch[1];
            const nameStart = Math.max(0, line.indexOf(name));
            const selectionRange = createRange(i, nameStart, name.length);
            const blockRange: Range = {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
            };

            const interfaceSymbol: DocumentSymbol = {
                name,
                kind: SymbolKind.Interface,
                range: blockRange,
                selectionRange,
                children: []
            };

            if (currentModule) {
                currentModule.children!.push(interfaceSymbol);
            } else {
                symbols.push(interfaceSymbol);
            }
            continue;
        }

        // 枚举定义
        const enumMatch = trimmedLine.match(/^Enumeration\s+(\w+)?\b/i);
        if (enumMatch) {
            const name = enumMatch[1] || 'Anonymous';
            const nameStart = enumMatch[1] ? Math.max(0, line.indexOf(enumMatch[1])) : 0;
            const selectionRange = createRange(i, nameStart, (enumMatch[1] || '').length || line.trim().length);
            const blockRange: Range = {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
            };

            currentEnumeration = {
                name,
                kind: SymbolKind.Enum,
                range: blockRange,
                selectionRange,
                children: []
            };

            if (currentModule) {
                currentModule.children!.push(currentEnumeration);
            } else {
                symbols.push(currentEnumeration);
            }
            continue;
        }

        // 枚举结束
        if (trimmedLine.match(/^EndEnumeration\b/i)) {
            currentEnumeration = null;
            continue;
        }

        // 过程定义
        const procMatch = trimmedLine.match(/^Procedure(?:C|DLL|CDLL)?(?:\.(\w+))?\s+(\w+)\s*\(/i);
        if (procMatch) {
            const returnType = procMatch[1];
            const name = procMatch[2];
            const displayName = returnType ? `${name}() : ${returnType}` : `${name}()`;
            const nameStart = Math.max(0, line.indexOf(name));
            const selectionRange = createRange(i, nameStart, name.length);
            const blockRange: Range = {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
            };

            currentProcedure = {
                name: displayName,
                kind: SymbolKind.Function,
                range: blockRange,
                selectionRange,
                children: []
            };

            if (currentModule) {
                currentModule.children!.push(currentProcedure);
            } else {
                symbols.push(currentProcedure);
            }
            continue;
        }

        // 过程结束
        if (trimmedLine.match(/^EndProcedure\b/i)) {
            currentProcedure = null;
            continue;
        }

        // 过程声明
        const declareMatch = trimmedLine.match(/^Declare(?:C|DLL|CDLL)?(?:\.(\w+))?\s+(\w+)\s*\(/i);
        if (declareMatch) {
            const returnType = declareMatch[1];
            const name = declareMatch[2];
            const displayName = returnType ? `${name}() : ${returnType}` : `${name}()`;
            const range = createRange(i, line.indexOf(name), name.length);

            const declareSymbol: DocumentSymbol = {
                name: displayName,
                kind: SymbolKind.Function,
                range,
                selectionRange: range
            };

            if (currentModule) {
                currentModule.children!.push(declareSymbol);
            } else {
                symbols.push(declareSymbol);
            }
            continue;
        }

        // 常量定义
        const constMatch = trimmedLine.match(/^#([a-zA-Z_][a-zA-Z0-9_]*\$?)\s*=/);
        if (constMatch) {
            const name = constMatch[1];
            const range = createRange(i, line.indexOf('#' + name), name.length + 1);

            const constSymbol: DocumentSymbol = {
                name: `#${name}`,
                kind: SymbolKind.Constant,
                range,
                selectionRange: range
            };

            if (currentEnumeration) {
                currentEnumeration.children!.push(constSymbol);
            } else if (currentModule) {
                currentModule.children!.push(constSymbol);
            } else {
                symbols.push(constSymbol);
            }
            continue;
        }

        // 全局变量
        const globalMatch = trimmedLine.match(/^(Global|Protected|Static)\s+(?:\w+\s+)?(\*?\w+)(?:\.(\w+))?/i);
        if (globalMatch) {
            const scope = globalMatch[1];
            const name = globalMatch[2];
            const type = globalMatch[3] || 'unknown';
            const displayName = `${name} : ${type}`;
            const range = createRange(i, line.indexOf(name), name.length);

            const varSymbol: DocumentSymbol = {
                name: displayName,
                kind: SymbolKind.Variable,
                range,
                selectionRange: range,
                detail: scope
            };

            if (currentModule) {
                currentModule.children!.push(varSymbol);
            } else {
                symbols.push(varSymbol);
            }
            continue;
        }

        // 结构体成员
        if (currentStructure) {
            const memberMatch = trimmedLine.match(/^(\*?\w+)(?:\.(\w+))?/);
            if (memberMatch && !trimmedLine.match(/^(Global|Protected|Static|Procedure|EndStructure|;)/i)) {
                const name = memberMatch[1];
                const type = memberMatch[2] || 'unknown';
                const displayName = `${name} : ${type}`;
                const range = createRange(i, line.indexOf(name), name.length);

                const memberSymbol: DocumentSymbol = {
                    name: displayName,
                    kind: SymbolKind.Field,
                    range,
                    selectionRange: range
                };

                currentStructure.children!.push(memberSymbol);
            }
        }

        // 局部变量（在过程内）
        if (currentProcedure) {
            const localVarMatch = trimmedLine.match(/^(Protected|Static|Define|Dim)\s+(?:\w+\s+)?(\*?\w+)(?:\.(\w+))?/i);
            if (localVarMatch) {
                const scope = localVarMatch[1];
                const name = localVarMatch[2];
                const type = localVarMatch[3] || 'unknown';
                const displayName = `${name} : ${type}`;
                const range = createRange(i, line.indexOf(name), name.length);

                const varSymbol: DocumentSymbol = {
                    name: displayName,
                    kind: SymbolKind.Variable,
                    range,
                    selectionRange: range,
                    detail: scope
                };

                currentProcedure.children!.push(varSymbol);
            }
        }
    }

    // 更新范围以包含整个定义
    updateSymbolRanges(symbols, lines);

    return symbols;
}

/**
 * 创建范围对象
 */
function createRange(line: number, startChar: number, length: number): Range {
    return {
        start: { line, character: startChar },
        end: { line, character: startChar + length }
    };
}

/**
 * 更新符号范围以包含整个定义
 */
function updateSymbolRanges(symbols: DocumentSymbol[], lines: string[]) {
    for (const symbol of symbols) {
        if (symbol.kind === SymbolKind.Module) {
            // 查找对应的EndModule
            const startLine = symbol.range.start.line;
            for (let i = startLine + 1; i < lines.length; i++) {
                if (lines[i].trim().match(/^EndModule\b/i)) {
                    symbol.range.end = { line: i, character: lines[i].length };
                    break;
                }
            }
        } else if (symbol.kind === SymbolKind.Function) {
            // 查找对应的EndProcedure
            const startLine = symbol.range.start.line;
            for (let i = startLine + 1; i < lines.length; i++) {
                if (lines[i].trim().match(/^EndProcedure\b/i)) {
                    symbol.range.end = { line: i, character: lines[i].length };
                    break;
                }
            }
        } else if (symbol.kind === SymbolKind.Struct) {
            // 查找对应的EndStructure
            const startLine = symbol.range.start.line;
            for (let i = startLine + 1; i < lines.length; i++) {
                if (lines[i].trim().match(/^EndStructure\b/i)) {
                    symbol.range.end = { line: i, character: lines[i].length };
                    break;
                }
            }
        }

        // 递归更新子符号
        if (symbol.children && symbol.children.length > 0) {
            updateSymbolRanges(symbol.children, lines);
        }
    }
}
