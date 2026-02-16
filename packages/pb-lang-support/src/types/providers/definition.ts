/**
 * 定义提供者相关类型定义
 */

import { TextDocument, Position, Range, Definition, Location } from 'vscode-languageserver';
import { CancellationToken } from '../utils/generics';
import { Result, AsyncResult } from '../utils/generics';
import { PureBasicSymbol } from '../core/symbol';

/** 定义上下文 */
export interface DefinitionContext {
    /** 文档位置 */
    position: Position;
    /** 文档 */
    document: TextDocument;
    /** 词汇 */
    word: string;
    /** 行文本 */
    lineText: string;
    /** 前缀文本 */
    prefix: string;
    /** 后缀文本 */
    suffix: string;
    /** 范围 */
    range: Range;
    /** 是否在字符串中 */
    inString: boolean;
    /** 是否在注释中 */
    inComment: boolean;
    /** 作用域 */
    scope?: DefinitionScope;
}

/** 定义作用域 */
export interface DefinitionScope {
    /** 当前模块 */
    module?: string;
    /** 当前过程 */
    procedure?: string;
    /** 可见符号 */
    visibleSymbols: PureBasicSymbol[];
    /** 导入符号 */
    importedSymbols: PureBasicSymbol[];
    /** 全局符号 */
    globalSymbols: PureBasicSymbol[];
}

/** 扩展的位置定义 */
export interface ExtendedLocation extends Location {
    /** 符号信息 */
    symbol?: PureBasicSymbol;
    /** 置信度 */
    confidence?: number;
    /** 来源 */
    source?: DefinitionSource;
    /** 相关位置 */
    relatedLocations?: ExtendedLocation[];
    /** 文档 */
    documentation?: string;
}

/** 定义来源 */
export enum DefinitionSource {
    /** 本地定义 */
    Local = 'local',
    /** 全局定义 */
    Global = 'global',
    /** 系统定义 */
    System = 'system',
    /** 库定义 */
    Library = 'library',
    /** 外部定义 */
    External = 'external',
    /** 推断定义 */
    Inferred = 'inferred',
    /** 缓存定义 */
    Cached = 'cached'
}

/** 定义提供者 */
export interface DefinitionProvider {
    /** 提供者名称 */
    name: string;
    /** 提供定义 */
    provideDefinition(
        document: TextDocument,
        position: Position,
        context: DefinitionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedLocation[], Error>;
    /** 提供类型定义 */
    provideTypeDefinition?(
        document: TextDocument,
        position: Position,
        context: DefinitionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedLocation[], Error>;
    /** 提供实现定义 */
    provideImplementation?(
        document: TextDocument,
        position: Position,
        context: DefinitionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedLocation[], Error>;
    /** 是否支持给定文档 */
    supports(document: TextDocument): boolean;
    /** 获取优先级 */
    getPriority?(context: DefinitionContext): number;
    /** 重置状态 */
    reset?(): void;
}

/** 定义解析器 */
export interface DefinitionResolver {
    /** 解析器名称 */
    name: string;
    /** 解析类型 */
    type: DefinitionType;
    /** 解析定义 */
    resolve(
        document: TextDocument,
        position: Position,
        context: DefinitionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedLocation[], Error>;
    /** 是否支持给定位置 */
    supports(context: DefinitionContext): boolean;
    /** 获取优先级 */
    getPriority(): number;
}

/** 定义类型 */
export enum DefinitionType {
    /** 变量定义 */
    Variable = 'variable',
    /** 函数定义 */
    Function = 'function',
    /** 过程定义 */
    Procedure = 'procedure',
    /** 结构定义 */
    Structure = 'structure',
    /** 接口定义 */
    Interface = 'interface',
    /** 类定义 */
    Class = 'class',
    /** 模块定义 */
    Module = 'module',
    /** 常量定义 */
    Constant = 'constant',
    /** 类型定义 */
    Type = 'type',
    /** 枚举定义 */
    Enum = 'enum',
    /** 键字定义 */
    Keyword = 'keyword',
    /** 系统API定义 */
    SystemAPI = 'system-api',
    /** 库函数定义 */
    LibraryFunction = 'library-function'
}

/** 定义配置 */
export interface DefinitionConfig {
    /** 是否启用 */
    enabled: boolean;
    /** 最大结果数 */
    maxResults: number;
    /** 启用缓存 */
    enableCache: boolean;
    /** 缓存大小 */
    cacheSize: number;
    /** 缓存过期时间（毫秒） */
    cacheTTL: number;
    /** 启用并行解析 */
    enableParallel: boolean;
    /** 最大并行数 */
    maxParallel: number;
    /** 超时时间（毫秒） */
    timeout: number;
    /** 提供者配置 */
    providers: DefinitionProviderConfig[];
}

/** 定义提供者配置 */
export interface DefinitionProviderConfig {
    /** 提供者名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 优先级 */
    priority: number;
    /** 语言 */
    languages?: string[];
    /** 文件模式 */
    filePatterns?: string[];
    /** 作用域 */
    scopes?: string[];
    /** 配置选项 */
    options?: Record<string, unknown>;
}

/** 定义统计 */
export interface DefinitionStats {
    /** 请求总数 */
    totalRequests: number;
    /** 成功请求数 */
    successfulRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 平均响应时间 */
    averageResponseTime: number;
    /** 平均结果数 */
    averageResultsPerRequest: number;
    /** 缓存命中率 */
    cacheHitRate: number;
    /** 按提供者统计 */
    byProvider: Record<string, DefinitionProviderStats>;
    /** 按类型统计 */
    byType: Record<string, number>;
}

/** 定义提供者统计 */
export interface DefinitionProviderStats {
    /** 提供者名称 */
    name: string;
    /** 请求数 */
    requests: number;
    /** 成功数 */
    successful: number;
    /** 失败数 */
    failed: number;
    /** 平均时间 */
    averageTime: number;
    /** 平均结果数 */
    averageResults: number;
    /** 缓存命中率 */
    cacheHitRate: number;
}

/** 定义缓存项 */
export interface DefinitionCacheItem {
    /** 键 */
    key: string;
    /** 位置 */
    locations: ExtendedLocation[];
    /** 上下文 */
    context: DefinitionContext;
    /** 过期时间 */
    expiresAt: number;
    /** 创建时间 */
    createdAt: number;
    /** 使用次数 */
    useCount: number;
    /** 最后使用时间 */
    lastUsed: number;
}