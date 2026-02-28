/**
 * 增强的符号缓存
 * 支持智能缓存失效、分层缓存和内存优化
 */

import { PureBasicSymbol, SymbolKind } from './types';
import { generateHash } from '../utils/hash-utils';

interface CacheEntry {
    symbols: PureBasicSymbol[];
    hash: string;
    lastAccess: number;
    accessCount: number;
    priority: number; // 1-5, 5为最高优先级
}

class EnhancedSymbolCache {
    private cache = new Map<string, CacheEntry>();
    private readonly maxCacheSize = 1000;
    private readonly maxEntriesPerDocument = 500;
    private accessTimes: Array<{ uri: string; time: number }> = [];

    /**
     * 智能设置文档符号
     * @param uri 文档URI
     * @param symbols 符号数组
     * @param contentHash 文档内容哈希，用于智能缓存失效
     */
    setSymbols(uri: string, symbols: PureBasicSymbol[], contentHash?: string): void {
        // 限制单个文档的符号数量
        if (symbols.length > this.maxEntriesPerDocument) {
            symbols = this.prioritizeSymbols(symbols);
        }

        const existing = this.cache.get(uri);
        const hash = contentHash || generateHash(JSON.stringify(symbols));

        // 如果哈希相同，只更新访问时间
        if (existing && existing.hash === hash) {
            existing.lastAccess = Date.now();
            existing.accessCount++;
            return;
        }

        // 计算文档优先级
        const priority = this.calculateDocumentPriority(uri, symbols);

        const entry: CacheEntry = {
            symbols,
            hash,
            lastAccess: Date.now(),
            accessCount: existing ? existing.accessCount + 1 : 1,
            priority
        };

        this.cache.set(uri, entry);
        this.recordAccess(uri);
        this.enforceCacheSizeLimit();
    }

    /**
     * 获取文档符号，支持哈希验证
     */
    getSymbols(uri: string, expectedHash?: string): PureBasicSymbol[] {
        const entry = this.cache.get(uri);
        if (!entry) {
            return [];
        }

        // 哈希验证
        if (expectedHash && entry.hash !== expectedHash) {
            this.cache.delete(uri);
            return [];
        }

        // 更新访问信息
        entry.lastAccess = Date.now();
        entry.accessCount++;
        this.recordAccess(uri);

        return entry.symbols;
    }

    /**
     * 获取缓存统计信息
     */
    getCacheStats(): {
        totalDocuments: number;
        totalSymbols: number;
        averageSymbolsPerDocument: number;
        memoryUsage: string;
        oldestAccess: number | null;
        mostAccessed: Array<{ uri: string; count: number }>;
    } {
        const totalDocuments = this.cache.size;
        let totalSymbols = 0;
        let mostAccessed: Array<{ uri: string; count: number }> = [];
        let oldestAccess = Date.now();

        for (const [uri, entry] of this.cache.entries()) {
            totalSymbols += entry.symbols.length;

            if (entry.accessCount > (mostAccessed[0]?.count || 0)) {
                mostAccessed = [{ uri, count: entry.accessCount }];
            } else if (entry.accessCount === mostAccessed[0]?.count) {
                mostAccessed.push({ uri, count: entry.accessCount });
            }

            if (entry.lastAccess < oldestAccess) {
                oldestAccess = entry.lastAccess;
            }
        }

        const averageSymbolsPerDocument = totalDocuments > 0 ? totalSymbols / totalDocuments : 0;
        const memoryUsage = this.estimateMemoryUsage();

        return {
            totalDocuments,
            totalSymbols,
            averageSymbolsPerDocument: Math.round(averageSymbolsPerDocument * 100) / 100,
            memoryUsage,
            oldestAccess: oldestAccess === Date.now() ? null : oldestAccess,
            mostAccessed: mostAccessed.slice(0, 5)
        };
    }

    /**
     * 查找符号（增强版本）
     */
    findSymbol(name: string, uri?: string, kind?: SymbolKind): PureBasicSymbol[] {
        const results: PureBasicSymbol[] = [];
        const searchName = name.toLowerCase();

        const searchInSymbols = (symbols: PureBasicSymbol[]) => {
            for (const symbol of symbols) {
                if (symbol.name.toLowerCase().includes(searchName)) {
                    if (!kind || symbol.kind === kind) {
                        results.push(symbol);
                    }
                }
            }
        };

        if (uri) {
            const entry = this.cache.get(uri);
            if (entry) {
                searchInSymbols(entry.symbols);
            }
        } else {
            // 按优先级排序搜索
            const sortedEntries = Array.from(this.cache.entries())
                .sort((a, b) => b[1].priority - a[1].priority);

            for (const [, entry] of sortedEntries) {
                searchInSymbols(entry.symbols);
            }
        }

        return results;
    }

    /**
     * 增强的详细符号查找
     */
    findSymbolDetailed(name: string, kind?: SymbolKind): Array<{ uri: string; symbol: PureBasicSymbol }> {
        const out: Array<{ uri: string; symbol: PureBasicSymbol }> = [];
        const searchName = name.toLowerCase();

        for (const [uri, entry] of this.cache.entries()) {
            for (const sym of entry.symbols) {
                if (sym.name.toLowerCase().includes(searchName)) {
                    if (!kind || sym.kind === kind) {
                        out.push({ uri, symbol: sym });
                    }
                }
            }
        }

        // 按访问优先级排序
        return out.sort((a, b) => {
            const entryA = this.cache.get(a.uri);
            const entryB = this.cache.get(b.uri);
            if (!entryA || !entryB) return 0;
            return entryB.priority - entryA.priority;
        });
    }

    /**
     * 批量清除多个文档的符号
     */
    clearMultipleSymbols(uris: string[]): void {
        for (const uri of uris) {
            this.cache.delete(uri);
        }
    }

    /**
     * 清除低优先级缓存
     */
    clearLowPriorityDocuments(): void {
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].priority - b[1].priority);

        const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
        for (const [uri] of toRemove) {
            this.cache.delete(uri);
        }
    }

    private calculateDocumentPriority(uri: string, symbols: PureBasicSymbol[]): number {
        let priority = 1; // 基础优先级

        // 基于符号类型提升优先级
        const hasProcedures = symbols.some(s => s.kind === SymbolKind.Procedure);
        const hasModules = symbols.some(s => s.kind === SymbolKind.Module);
        const hasStructures = symbols.some(s => s.kind === SymbolKind.Structure);

        if (hasProcedures) priority += 1;
        if (hasModules) priority += 1;
        if (hasStructures) priority += 1;

        // 基于文件路径提升优先级（例如，主文件）
        if (uri.includes('main') || uri.includes('index')) {
            priority += 1;
        }

        return Math.min(priority, 5);
    }

    private prioritizeSymbols(symbols: PureBasicSymbol[]): PureBasicSymbol[] {
        // 优先级排序：过程 > 模块 > 结构 > 常量 > 变量
        const kindPriority: Record<SymbolKind, number> = {
            [SymbolKind.Procedure]: 5,
            [SymbolKind.Function]: 5,
            [SymbolKind.Module]: 4,
            [SymbolKind.Structure]: 3,
            [SymbolKind.Interface]: 3,
            [SymbolKind.Enumeration]: 3,
            [SymbolKind.Constant]: 2,
            [SymbolKind.Variable]: 1,
            [SymbolKind.Keyword]: 1,
            [SymbolKind.Operator]: 1,
            [SymbolKind.Parameter]: 1
        };

        return symbols
            .sort((a, b) => (kindPriority[b.kind] || 1) - (kindPriority[a.kind] || 1))
            .slice(0, this.maxEntriesPerDocument);
    }

    private recordAccess(uri: string): void {
        this.accessTimes.push({ uri, time: Date.now() });

        // 保留最近1000次访问记录 - 一次性裁剪，避免多次 shift()
        const overflow = this.accessTimes.length - 1000;
        if (overflow > 0) {
            this.accessTimes.splice(0, overflow);
        }
    }

    private enforceCacheSizeLimit(): void {
        if (this.cache.size <= this.maxCacheSize) {
            return;
        }

        // LRU策略：移除最近最少使用的文档
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

        const toRemove = entries.slice(0, this.cache.size - this.maxCacheSize);
        for (const [uri] of toRemove) {
            this.cache.delete(uri);
        }
    }

    private estimateMemoryUsage(): string {
        let totalSize = 0;
        for (const entry of this.cache.values()) {
            totalSize += JSON.stringify(entry).length;
        }

        if (totalSize < 1024) {
            return `${totalSize} B`;
        } else if (totalSize < 1024 * 1024) {
            return `${Math.round(totalSize / 1024 * 100) / 100} KB`;
        } else {
            return `${Math.round(totalSize / (1024 * 1024) * 100) / 100} MB`;
        }
    }

    /**
     * 清除文档的符号
     */
    clearSymbols(uri: string): void {
        this.cache.delete(uri);
    }

    /**
     * 清除所有符号
     */
    clearAll(): void {
        this.cache.clear();
        this.accessTimes = [];
    }
}

export const symbolCache = new EnhancedSymbolCache();
