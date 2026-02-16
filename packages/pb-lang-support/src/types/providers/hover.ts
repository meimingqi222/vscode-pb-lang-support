/**
 * 悬停提供者相关类型定义
 */

import { TextDocument, Position, Range, Hover, MarkedString } from 'vscode-languageserver';
import { CancellationToken } from '../utils/generics';
import { Result, AsyncResult } from '../utils/generics';
import { PureBasicSymbol } from '../core/symbol';

/** 悬停上下文 */
export interface HoverContext {
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
    scope?: HoverScope;
}

/** 悬停作用域 */
export interface HoverScope {
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

/** 扩展的悬停信息 */
export interface ExtendedHover extends Hover {
    /** 符号信息 */
    symbol?: PureBasicSymbol;
    /** 来源 */
    source?: HoverSource;
    /** 置信度 */
    confidence?: number;
    /** 相关符号 */
    relatedSymbols?: PureBasicSymbol[];
    /** 示例 */
    examples?: HoverExample[];
    /** 链接 */
    links?: HoverLink[];
    /** 行动 */
    actions?: HoverAction[];
}

/** 悬停来源 */
export enum HoverSource {
    /** 本地符号 */
    LocalSymbol = 'local-symbol',
    /** 全局符号 */
    GlobalSymbol = 'global-symbol',
    /** 系统API */
    SystemAPI = 'system-api',
    /** 库函数 */
    LibraryFunction = 'library-function',
    /** 关键字 */
    Keyword = 'keyword',
    /** 常量 */
    Constant = 'constant',
    /** 类型 */
    Type = 'type',
    /** 注释 */
    Comment = 'comment',
    /** 字符串 */
    String = 'string',
    /** 错误 */
    Error = 'error',
    /** 警告 */
    Warning = 'warning',
    /** 缓存 */
    Cached = 'cached'
}

/** 悬停示例 */
export interface HoverExample {
    /** 描述 */
    description: string;
    /** 代码 */
    code: string;
    /** 语言 */
    language?: string;
    /** 输出 */
    output?: string;
    /** 注意事项 */
    notes?: string[];
}

/** 悬停链接 */
export interface HoverLink {
    /** 标题 */
    title: string;
    /** URL */
    url: string;
    /** 描述 */
    description?: string;
    /** 图标 */
    icon?: string;
}

/** 悬停行动 */
export interface HoverAction {
    /** 标题 */
    title: string;
    /** 命令 */
    command: string;
    /** 参数 */
    arguments?: any[];
    /** 图标 */
    icon?: string;
    /** 当 */
    when?: string;
}

/** 悬停内容 */
export interface HoverContent {
    /** 主要内容 */
    main: HoverContentPart[];
    /** 详细信息 */
    details?: HoverContentPart[];
    /** 元数据 */
    metadata?: HoverMetadata;
}

/** 悬停内容部分 */
export interface HoverContentPart {
    /** 内容类型 */
    type: 'text' | 'code' | 'table' | 'list' | 'image' | 'link';
    /** 内容 */
    content: string | TableContent | ListContent | ImageContent | LinkContent;
    /** 样式 */
    style?: HoverContentStyle;
    /** 语言 */
    language?: string;
}

/** 表格内容 */
export interface TableContent {
    /** 表头 */
    headers: string[];
    /** 行 */
    rows: string[][];
    /** 样式 */
    style?: TableStyle;
}

/** 表格样式 */
export interface TableStyle {
    /** 边框 */
    border?: boolean;
    /** 对齐 */
    alignment?: 'left' | 'center' | 'right';
    /** 颜色 */
    color?: string;
    /** 背景色 */
    backgroundColor?: string;
}

/** 列表内容 */
export interface ListContent {
    /** 项目 */
    items: string[];
    /** 类型 */
    type: 'ordered' | 'unordered' | 'task';
    /** 样式 */
    style?: ListStyle;
}

/** 列表样式 */
export interface ListStyle {
    /** 标记 */
    marker?: string;
    /** 颜色 */
    color?: string;
    /** 缩进 */
    indent?: number;
}

/** 图像内容 */
export interface ImageContent {
    /** URL */
    url: string;
    /** 替代文本 */
    altText: string;
    /** 宽度 */
    width?: number;
    /** 高度 */
    height?: number;
    /** 标题 */
    title?: string;
}

/** 链接内容 */
export interface LinkContent {
    /** 文本 */
    text: string;
    /** URL */
    url: string;
    /** 标题 */
    title?: string;
    /** 目标 */
    target?: '_blank' | '_self' | '_parent' | '_top';
}

/** 悬停内容样式 */
export interface HoverContentStyle {
    /** 粗体 */
    bold?: boolean;
    /** 斜体 */
    italic?: boolean;
    /** 下划线 */
    underline?: boolean;
    /** 代码样式 */
    code?: boolean;
    /** 颜色 */
    color?: string;
    /** 背景色 */
    backgroundColor?: string;
    /** 字体大小 */
    fontSize?: number;
    /** 字体系列 */
    fontFamily?: string;
    /** 对齐 */
    alignment?: 'left' | 'center' | 'right';
}

/** 悬停元数据 */
export interface HoverMetadata {
    /** 来源 */
    source: HoverSource;
    /** 创建时间 */
    createdAt: number;
    /** 过期时间 */
    expiresAt?: number;
    /** 版本 */
    version?: string;
    /** 标签 */
    tags: string[];
    /** 置信度 */
    confidence: number;
    /** 符号信息 */
    symbol?: PureBasicSymbol;
}

/** 悬停提供者 */
export interface HoverProvider {
    /** 提供者名称 */
    name: string;
    /** 提供悬停信息 */
    provideHover(
        document: TextDocument,
        position: Position,
        context: HoverContext,
        token: CancellationToken
    ): AsyncResult<ExtendedHover, Error>;
    /** 是否支持给定文档 */
    supports(document: TextDocument): boolean;
    /** 获取优先级 */
    getPriority?(context: HoverContext): number;
    /** 重置状态 */
    reset?(): void;
}

/** 悬停解析器 */
export interface HoverResolver {
    /** 解析器名称 */
    name: string;
    /** 解析类型 */
    type: HoverType;
    /** 解析悬停信息 */
    resolve(
        document: TextDocument,
        position: Position,
        context: HoverContext,
        token: CancellationToken
    ): AsyncResult<ExtendedHover, Error>;
    /** 是否支持给定位置 */
    supports(context: HoverContext): boolean;
    /** 获取优先级 */
    getPriority(): number;
}

/** 悬停类型 */
export enum HoverType {
    /** 符号悬停 */
    Symbol = 'symbol',
    /** 关键字悬停 */
    Keyword = 'keyword',
    /** 常量悬停 */
    Constant = 'constant',
    /** 类型悬停 */
    Type = 'type',
    /** 函数悬停 */
    Function = 'function',
    /** 变量悬停 */
    Variable = 'variable',
    /** 参数悬停 */
    Parameter = 'parameter',
    /** 结构悬停 */
    Structure = 'structure',
    /** 枚举悬停 */
    Enum = 'enum',
    /** 注释悬停 */
    Comment = 'comment',
    /** 字符串悬停 */
    String = 'string',
    /** 错误悬停 */
    Error = 'error',
    /** 警告悬停 */
    Warning = 'warning',
    /** 自定义悬停 */
    Custom = 'custom'
}

/** 悬停配置 */
export interface HoverConfig {
    /** 是否启用 */
    enabled: boolean;
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
    /** 内容格式 */
    contentFormat: 'plaintext' | 'markdown';
    /** 最大内容长度 */
    maxContentLength: number;
    /** 提供者配置 */
    providers: HoverProviderConfig[];
}

/** 悬停提供者配置 */
export interface HoverProviderConfig {
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

/** 悬停统计 */
export interface HoverStats {
    /** 请求总数 */
    totalRequests: number;
    /** 成功请求数 */
    successfulRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 平均响应时间 */
    averageResponseTime: number;
    /** 缓存命中率 */
    cacheHitRate: number;
    /** 按提供者统计 */
    byProvider: Record<string, HoverProviderStats>;
    /** 按类型统计 */
    byType: Record<string, number>;
}

/** 悬停提供者统计 */
export interface HoverProviderStats {
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
    /** 缓存命中率 */
    cacheHitRate: number;
}

/** 悬停缓存项 */
export interface HoverCacheItem {
    /** 键 */
    key: string;
    /** 悬停信息 */
    hover: ExtendedHover;
    /** 上下文 */
    context: HoverContext;
    /** 过期时间 */
    expiresAt: number;
    /** 创建时间 */
    createdAt: number;
    /** 使用次数 */
    useCount: number;
    /** 最后使用时间 */
    lastUsed: number;
}