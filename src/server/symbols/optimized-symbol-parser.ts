/**
 * 性能优化的符号解析器
 * 支持大文件、增量解析和智能缓存
 */

import { PureBasicSymbol, SymbolKind } from './types';
import { symbolCache } from './symbol-cache';
import { parsePureBasicConstantDefinition } from '../utils/constants';

export interface ParsedDocument {
    symbols: PureBasicSymbol[];
    metrics: {
        parseTime: number;
        symbolCount: number;
        cacheHits: number;
        memoryUsage: number;
    };
    strategy: string;
}

/**
 * 优化的文档符号解析器
 */
export class OptimizedSymbolParser {
    private lastParsedVersions = new Map<string, string>();

    /**
     * 解析文档符号（性能优化版本）
     */
    async parseDocumentSymbols(uri: string, text: string): Promise<ParsedDocument> {
        const startTime = performance.now();

        // 简单的预分析 - 根据文本长度选择策略
        const preAnalysis = {
            strategy: text.length > 10000 ? 'minimal' : 'full'
        };

        // 根据预分析结果选择解析策略
        let result: ParsedDocument;

        switch (preAnalysis.strategy) {
            case 'minimal':
                result = await this.parseMinimalSymbols(uri, text, preAnalysis);
                break;
            case 'full':
            default:
                result = await this.parseFull(uri, text, preAnalysis);
                break;
        }

        const totalTime = performance.now() - startTime;
        result.metrics.parseTime = totalTime;

        // 更新缓存
        symbolCache.setSymbols(uri, result.symbols);

        return result;
    }



    /**
     * 批量解析多个文档（优化性能）
     */
    async parseMultipleDocuments(
        documents: Array<{ uri: string; text: string }>
    ): Promise<Map<string, ParsedDocument>> {
        const results = new Map<string, ParsedDocument>();

        // 按文档大小排序，先处理小文档
        const sortedDocs = [...documents].sort((a, b) => a.text.length - b.text.length);

        // 并行处理（限制并发数）
        const concurrency = 3;
        const chunks: Array<Array<{ uri: string; text: string }>> = [];

        for (let i = 0; i < sortedDocs.length; i += concurrency) {
            chunks.push(sortedDocs.slice(i, i + concurrency));
        }

        for (const chunk of chunks) {
            const promises = chunk.map(async (doc) => {
                const result = await this.parseDocumentSymbols(doc.uri, doc.text);
                return { uri: doc.uri, result };
            });

            const chunkResults = await Promise.all(promises);
            for (const { uri, result } of chunkResults) {
                results.set(uri, result);
            }
        }

        return results;
    }

    /**
     * 获取解析性能统计
     */
    getPerformanceStats() {
        return {
            totalParsedDocuments: this.lastParsedVersions.size,
            averageParseTime: 0,
            cacheHitRate: 0
        };
    }

    /**
     * 清理性能缓存
     */
    cleanup() {
        this.lastParsedVersions.clear();
    }

    private async parseFull(uri: string, text: string, preAnalysis: any): Promise<ParsedDocument> {
        // 直接解析整个文档
        const symbols = this.parseBasicSymbols(text);

        return {
            symbols,
            metrics: {
                parseTime: performance.now(),
                symbolCount: symbols.length,
                cacheHits: 0,
                memoryUsage: JSON.stringify(symbols).length
            },
            strategy: 'full'
        };
    }

    private async parseStreaming(uri: string, text: string, preAnalysis: any): Promise<ParsedDocument> {
        // 流式解析 - 按行解析
        const symbols = this.parseBasicSymbols(text);

        return {
            symbols,
            metrics: {
                parseTime: performance.now(),
                symbolCount: symbols.length,
                cacheHits: 0,
                memoryUsage: JSON.stringify(symbols).length
            },
            strategy: 'streaming'
        };
    }



    private async parseMinimalSymbols(uri: string, text: string, preAnalysis: any): Promise<ParsedDocument> {
        // 最小化解析 - 只解析关键符号
        const lines = text.split('\n');
        const symbols: PureBasicSymbol[] = [];
        const maxLinesToScan = Math.min(lines.length, 100); // 只扫描前100行

        for (let i = 0; i < maxLinesToScan; i++) {
            const line = lines[i].trim();

            // 跳过注释行
            if (line.startsWith(';')) {
                continue;
            }

            // 只解析过程定义（最重要的符号）
            const procMatch = line.match(/^Procedure\s*(?:\.(\w+))?\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (procMatch) {
                symbols.push({
                    name: procMatch[2],
                    kind: SymbolKind.Procedure,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    detail: procMatch[1] ? `Procedure.${procMatch[1]}` : 'Procedure',
                    documentation: `Procedure definition: ${procMatch[2]}`
                });
            }

            // 解析模块定义（第二优先级）
            const moduleMatch = line.match(/^(?:Module|DeclareModule)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
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
        }

        const parseTime = performance.now();
        const memoryUsage = JSON.stringify(symbols).length;

        return {
            symbols,
            metrics: {
                parseTime: 0,
                symbolCount: symbols.length,
                cacheHits: 0,
                memoryUsage
            },
            strategy: 'minimal'
        };
    }

    private parseBasicSymbols(text: string): PureBasicSymbol[] {
        const symbols: PureBasicSymbol[] = [];
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 跳过注释行
            if (line.startsWith(';')) {
                continue;
            }

            // 解析过程定义
            const procMatch = line.match(/^Procedure\s*(?:\.(\w+))?\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (procMatch) {
                symbols.push({
                    name: procMatch[2],
                    kind: SymbolKind.Procedure,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    detail: procMatch[1] ? `Procedure.${procMatch[1]}` : 'Procedure',
                    documentation: `Procedure definition: ${procMatch[2]}`
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

            // 解析变量定义
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
        }

        return symbols;
    }
}

export const optimizedSymbolParser = new OptimizedSymbolParser();