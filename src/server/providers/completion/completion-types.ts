/**
 * 代码补全相关类型定义
 */

import { CompletionItem, CompletionItemKind, Position, TextDocument } from 'vscode-languageserver';
import { PureBasicSymbol, SymbolKind } from '../../symbols/types';

/** 补全上下文信息 */
export interface CompletionContext {
    /** 文档内容 */
    document: TextDocument;
    /** 当前位置 */
    position: Position;
    /** 当前行文本 */
    lineText: string;
    /** 当前单词 */
    currentWord: string;
    /** 前一个单词 */
    previousWord: string;
    /** 行前缀文本 */
    linePrefix: string;
    /** 是否在引号内 */
    isInQuotes: boolean;
    /** 是否在注释中 */
    isInComment: boolean;
    /** 行号 */
    lineNumber: number;
}

/** 补全提取器接口 */
export interface CompletionExtractor {
    /** 提取器名称 */
    name: string;
    /** 是否支持给定的上下文 */
    supports(context: CompletionContext): boolean;
    /** 提取符号 */
    extract(context: CompletionContext): Promise<PureBasicSymbol[]>;
}

/** 补全处理器接口 */
export interface CompletionHandler {
    /** 处理器名称 */
    name: string;
    /** 处理的符号类型 */
    symbolTypes: SymbolKind[];
    /** 处理补全项 */
    handle(context: CompletionContext, symbols: PureBasicSymbol[]): Promise<CompletionItem[]>;
}

/** 补全配置 */
export interface CompletionConfig {
    /** 最大补全项数量 */
    maxItems: number;
    /** 是否启用智能过滤 */
    enableSmartFilter: boolean;
    /** 是否包含内置函数 */
    includeBuiltins: boolean;
    /** 是否包含文档符号 */
    includeDocumentSymbols: boolean;
    /** 是否包含模块符号 */
    includeModuleSymbols: boolean;
}

/** 补全统计信息 */
export interface CompletionStats {
    /** 总请求数 */
    totalRequests: number;
    /** 缓存命中数 */
    cacheHits: number;
    /** 平均响应时间 */
    averageResponseTime: number;
    /** 补全项生成数 */
    itemsGenerated: number;
    /** 错误数 */
    errors: number;
}

/** 符号提取结果 */
export interface SymbolExtractResult {
    /** 文档符号 */
    documentSymbols: PureBasicSymbol[];
    /** 模块符号 */
    moduleSymbols: PureBasicSymbol[];
    /** 结构体符号 */
    structureSymbols: PureBasicSymbol[];
    /** 内置符号 */
    builtinSymbols: PureBasicSymbol[];
}

/** 补全项工厂配置 */
export interface CompletionFactoryConfig {
    /** 是否包含文档 */
    includeDocumentation: boolean;
    /** 是否包含类型信息 */
    includeTypeInfo: boolean;
    /** 是否包含模块信息 */
    includeModuleInfo: boolean;
    /** 排序权重 */
    sortWeights: {
        local: number;
        module: number;
        builtin: number;
        structure: number;
    };
}