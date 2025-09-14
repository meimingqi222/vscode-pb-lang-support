/**
 * 补全项工厂
 * 负责创建标准化的补全项
 */

import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import { PureBasicSymbol, SymbolKind } from '../../symbols/types';
import { CompletionContext, CompletionFactoryConfig, SymbolExtractResult } from './completion-types';

/**
 * 补全项工厂类
 */
export class CompletionItemFactory {
    private config: CompletionFactoryConfig;

    constructor(config: Partial<CompletionFactoryConfig> = {}) {
        this.config = {
            includeDocumentation: true,
            includeTypeInfo: true,
            includeModuleInfo: true,
            sortWeights: {
                local: 100,
                module: 80,
                builtin: 60,
                structure: 40
            },
            ...config
        };
    }

    /**
     * 从符号创建补全项
     */
    createFromSymbol(symbol: PureBasicSymbol, context: CompletionContext, sourceType: 'local' | 'module' | 'builtin' | 'structure' = 'local'): CompletionItem {
        const item: CompletionItem = {
            label: symbol.name,
            kind: this.mapSymbolKindToCompletionKind(symbol.kind),
            detail: this.generateDetail(symbol, sourceType),
            documentation: this.config.includeDocumentation ? symbol.documentation : undefined,
            insertText: this.generateInsertText(symbol, context),
            insertTextFormat: InsertTextFormat.PlainText,
            sortText: this.generateSortText(symbol, sourceType),
            data: {
                symbol,
                sourceType
            }
        };

        // 添加额外的元数据
        if (this.config.includeTypeInfo && symbol.detail) {
            item.data.typeInfo = symbol.detail;
        }

        if (this.config.includeModuleInfo && symbol.module) {
            item.data.module = symbol.module;
        }

        return item;
    }

    /**
     * 批量创建补全项
     */
    createBatch(symbols: PureBasicSymbol[], context: CompletionContext, sourceType: 'local' | 'module' | 'builtin' | 'structure' = 'local'): CompletionItem[] {
        return symbols.map(symbol => this.createFromSymbol(symbol, context, sourceType));
    }

    /**
     * 从提取结果创建所有补全项
     */
    createFromExtractResult(result: SymbolExtractResult, context: CompletionContext): CompletionItem[] {
        const items: CompletionItem[] = [];

        // 本地符号
        if (result.documentSymbols.length > 0) {
            items.push(...this.createBatch(result.documentSymbols, context, 'local'));
        }

        // 模块符号
        if (result.moduleSymbols.length > 0) {
            items.push(...this.createBatch(result.moduleSymbols, context, 'module'));
        }

        // 结构体符号
        if (result.structureSymbols.length > 0) {
            items.push(...this.createBatch(result.structureSymbols, context, 'structure'));
        }

        // 内置符号
        if (result.builtinSymbols.length > 0) {
            items.push(...this.createBatch(result.builtinSymbols, context, 'builtin'));
        }

        return items;
    }

    /**
     * 映射符号类型到补全项类型
     */
    private mapSymbolKindToCompletionKind(symbolKind: SymbolKind): CompletionItemKind {
        switch (symbolKind) {
            case SymbolKind.Procedure:
            case SymbolKind.Function:
                return CompletionItemKind.Function;
            case SymbolKind.Variable:
                return CompletionItemKind.Variable;
            case SymbolKind.Constant:
                return CompletionItemKind.Constant;
            case SymbolKind.Structure:
                return CompletionItemKind.Struct;
            case SymbolKind.Interface:
                return CompletionItemKind.Interface;
            case SymbolKind.Module:
                return CompletionItemKind.Module;
            case SymbolKind.Keyword:
                return CompletionItemKind.Keyword;
            case SymbolKind.Operator:
                return CompletionItemKind.Operator;
            case SymbolKind.Parameter:
                return CompletionItemKind.TypeParameter;
            default:
                return CompletionItemKind.Text;
        }
    }

    /**
     * 生成详细信息
     */
    private generateDetail(symbol: PureBasicSymbol, sourceType: string): string {
        let detail = symbol.detail || '';

        // 添加来源信息
        if (sourceType === 'module' && symbol.module) {
            detail = `${detail} (from ${symbol.module})`;
        } else if (sourceType === 'builtin') {
            detail = `${detail} (built-in)`;
        } else if (sourceType === 'structure') {
            detail = `${detail} (structure)`;
        }

        return detail;
    }

    /**
     * 生成插入文本
     */
    private generateInsertText(symbol: PureBasicSymbol, context: CompletionContext): string {
        const { currentWord, linePrefix } = context;

        // 对于函数和过程，添加括号
        if (symbol.kind === SymbolKind.Procedure || symbol.kind === SymbolKind.Function) {
            // 如果光标前有点号，可能是模块函数调用
            if (linePrefix.endsWith('.')) {
                return symbol.name;
            }
            return `${symbol.name}()`;
        }

        // 对于结构体，添加点号提示成员访问
        if (symbol.kind === SymbolKind.Structure) {
            return `${symbol.name}.`;
        }

        // 默认情况
        return symbol.name;
    }

    /**
     * 生成排序文本
     */
    private generateSortText(symbol: PureBasicSymbol, sourceType: string): string {
        const weight = this.config.sortWeights[sourceType as keyof typeof this.config.sortWeights] || 50;

        // 根据符号类型添加额外的权重
        let typeWeight = 0;
        switch (symbol.kind) {
            case SymbolKind.Procedure:
            case SymbolKind.Function:
                typeWeight = 10;
                break;
            case SymbolKind.Variable:
                typeWeight = 8;
                break;
            case SymbolKind.Constant:
                typeWeight = 6;
                break;
            case SymbolKind.Structure:
                typeWeight = 4;
                break;
            default:
                typeWeight = 2;
        }

        const totalWeight = weight + typeWeight;
        return totalWeight.toString().padStart(4, '0') + symbol.name.toLowerCase();
    }

    /**
     * 更新工厂配置
     */
    updateConfig(config: Partial<CompletionFactoryConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 获取当前配置
     */
    getConfig(): CompletionFactoryConfig {
        return { ...this.config };
    }
}