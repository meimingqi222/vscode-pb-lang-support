/**
 * 符号管理器
 * 负责解析和管理PureBasic符号
 */

import { PureBasicSymbol, SymbolKind } from './types';
import { symbolCache } from './symbol-cache';
import { generateHash } from '../utils/hash-utils';
import { optimizedSymbolParser } from './optimized-symbol-parser';
import { ParsedDocument } from './optimized-symbol-parser';
import { parsePureBasicConstantDefinition } from '../utils/constants';

/**
 * 解析文档中的符号（性能优化版本）
 * @deprecated 使用 optimizedSymbolParser.parseDocumentSymbols 替代
 */
export function parseDocumentSymbols(uri: string, text: string): void {
    // 跳过.pbp项目文件的符号解析（它们是XML格式，不是PureBasic代码）
    if (uri.endsWith('.pbp')) {
        return;
    }

    // 使用优化的解析器
    optimizedSymbolParser.parseDocumentSymbols(uri, text).catch(error => {
        console.error('Symbol parsing error:', error);
        // 降级到基本解析
        parseDocumentSymbolsFallback(uri, text);
    });
}

/**
 * 降级的基本符号解析
 */
function parseDocumentSymbolsFallback(uri: string, text: string): void {
    const symbols: PureBasicSymbol[] = [];
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 解析过程定义（包括返回类型）
        const procMatch = line.match(/^Procedure(?:C|DLL|CDLL)?\s*(?:\.(\w+))?\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (procMatch) {
            symbols.push({
                name: procMatch[2],
                kind: SymbolKind.Procedure,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: procMatch[1] ? `Procedure.${procMatch[1]}` : 'Procedure',
                documentation: `Procedure definition: ${procMatch[2]}${procMatch[1] ? ` (returns ${procMatch[1]})` : ''}`
            });
        }

        // 解析结构定义
        const structMatch = line.match(/^Structure\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (structMatch) {
            symbols.push({
                name: structMatch[1],
                kind: SymbolKind.Structure,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Structure',
                documentation: `Structure definition: ${structMatch[1]}`
            });
        }

        // 解析接口定义
        const interfaceMatch = line.match(/^Interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (interfaceMatch) {
            symbols.push({
                name: interfaceMatch[1],
                kind: SymbolKind.Interface,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Interface',
                documentation: `Interface definition: ${interfaceMatch[1]}`
            });
        }

        // 解析枚举定义
        const enumMatch = line.match(/^Enumeration\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (enumMatch) {
            symbols.push({
                name: enumMatch[1],
                kind: SymbolKind.Enumeration,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Enumeration',
                documentation: `Enumeration definition: ${enumMatch[1]}`
            });
        }

        // 解析DeclareModule
        const declareModuleMatch = line.match(/^DeclareModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (declareModuleMatch) {
            symbols.push({
                name: declareModuleMatch[1],
                kind: SymbolKind.Module,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'DeclareModule',
                documentation: `DeclareModule definition: ${declareModuleMatch[1]}`
            });
        }

        // 解析Module
        const moduleMatch = line.match(/^Module\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (moduleMatch) {
            symbols.push({
                name: moduleMatch[1],
                kind: SymbolKind.Module,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Module',
                documentation: `Module definition: ${moduleMatch[1]}`
            });
        }

        // 解析常量定义
        const constMatch = parsePureBasicConstantDefinition(line);
        if (constMatch) {
            symbols.push({
                name: constMatch.name,
                kind: SymbolKind.Constant,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Constant',
                documentation: `Constant definition: #${constMatch.name} = ${(constMatch.value || '').trim()}`
            });
        }

        // 解析变量定义（包括类型）
        const varMatch = line.match(/^(?:Global|Protected|Static|Shared|Threaded)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[.](\w+)/);
        if (varMatch) {
            symbols.push({
                name: varMatch[1],
                kind: SymbolKind.Variable,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: `Variable.${varMatch[2]}`,
                documentation: `Variable definition: ${varMatch[1]}.${varMatch[2]}`
            });
        }

        // 解析数组定义
        const arrayMatch = line.match(/^(?:Dim|Global|Protected|Static)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/);
        if (arrayMatch) {
            symbols.push({
                name: arrayMatch[1],
                kind: SymbolKind.Variable,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'Array',
                documentation: `Array definition: ${arrayMatch[1]}(${arrayMatch[2]})`
            });
        }

        // 解析列表定义
        const listMatch = line.match(/^NewList\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[.](\w+)/);
        if (listMatch) {
            symbols.push({
                name: listMatch[1],
                kind: SymbolKind.Variable,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                detail: 'List',
                documentation: `List definition: NewList ${listMatch[1]}.${listMatch[2]}`
            });
        }
    }

    // 生成内容哈希用于智能缓存
    const contentHash = generateHash(text);

    // 更新符号缓存（使用增强功能）
    symbolCache.setSymbols(uri, symbols, contentHash);
}

/**
 * 增量更新文档符号（性能优化版本）
 */
export async function updateDocumentSymbolsIncrementally(uri: string, text: string, oldText: string): Promise<void> {
    try {
        await optimizedSymbolParser.updateDocumentSymbolsIncrementally(uri, text, oldText);
    } catch (error) {
        console.error('Incremental symbol update error:', error);
        // 降级到完整重新解析
        parseDocumentSymbols(uri, text);
    }
}

/**
 * 批量解析多个文档（性能优化）
 */
export async function parseMultipleDocuments(documents: Array<{ uri: string; text: string }>): Promise<Map<string, ParsedDocument>> {
    return await optimizedSymbolParser.parseMultipleDocuments(documents);
}

/**
 * 解析单个符号（用于增量更新）
 */
function parseSingleSymbol(line: string, lineIndex: number): PureBasicSymbol | null {
    // 解析过程定义
    const procMatch = line.match(/^Procedure\s*(?:\.(\w+))?\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (procMatch) {
        return {
            name: procMatch[2],
            kind: SymbolKind.Procedure,
            range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
            },
            detail: procMatch[1] ? `Procedure.${procMatch[1]}` : 'Procedure',
            documentation: `Procedure definition: ${procMatch[2]}`
        };
    }

    // 解析结构定义
    const structMatch = line.match(/^Structure\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (structMatch) {
        return {
            name: structMatch[1],
            kind: SymbolKind.Structure,
            range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
            },
            detail: 'Structure',
            documentation: `Structure definition: ${structMatch[1]}`
        };
    }

    // 解析常量定义
    const constMatch = parsePureBasicConstantDefinition(line);
    if (constMatch) {
        return {
            name: constMatch.name,
            kind: SymbolKind.Constant,
            range: {
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: line.length }
            },
            detail: 'Constant',
            documentation: `Constant definition: #${constMatch.name} = ${(constMatch.value || '').trim()}`
        };
    }

    return null;
}

/**
 * 获取符号缓存统计信息
 */
export function getSymbolCacheStats() {
    return symbolCache.getCacheStats();
}

/**
 * 获取性能统计信息
 */
export function getPerformanceStats() {
    return optimizedSymbolParser.getPerformanceStats();
}

/**
 * 清理性能缓存
 */
export function cleanupPerformanceCache() {
    optimizedSymbolParser.cleanup();
}
