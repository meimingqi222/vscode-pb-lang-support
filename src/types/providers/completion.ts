/**
 * 完成提供者相关类型定义
 */

import { TextDocument, Position, Range, CompletionItem, Definition, Hover, SignatureHelp, InsertTextFormat } from 'vscode-languageserver';
import { CancellationToken } from '../utils/generics';
import { Result, AsyncResult } from '../utils/generics';
import { PureBasicSymbol } from '../core/symbol';
import { CompletionFilterConfig as CoreCompletionFilterConfig, CompletionSortConfig as CoreCompletionSortConfig } from '../core/config';

/** 完成上下文 */
export interface CompletionContext {
    /** 触发字符 */
    triggerCharacter?: string;
    /** 触发类型 */
    triggerKind: 'Invoked' | 'TriggerCharacter' | 'TriggerForIncompleteCompletions';
    /** 文档位置 */
    position: Position;
    /** 文档 */
    document: TextDocument;
    /** 前缀文本 */
    prefix: string;
    /** 后缀文本 */
    suffix: string;
    /** 行文本 */
    lineText: string;
    /** 范围 */
    range: Range;
    /** 是否在字符串中 */
    inString: boolean;
    /** 是否在注释中 */
    inComment: boolean;
    /** 作用域 */
    scope?: CompletionScope;
}

/** 完成作用域 */
export interface CompletionScope {
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

/** 完成项来源 */
export enum CompletionItemSource {
    /** 内置关键字 */
    Keyword = 'keyword',
    /** 内置函数 */
    BuiltInFunction = 'builtin-function',
    /** 内置常量 */
    BuiltInConstant = 'builtin-constant',
    /** 用户定义 */
    UserDefined = 'user-defined',
    /** 系统API */
    SystemAPI = 'system-api',
    /** 库函数 */
    LibraryFunction = 'library-function',
    /** 变量 */
    Variable = 'variable',
    /** 过程 */
    Procedure = 'procedure',
    /** 结构 */
    Structure = 'structure',
    /** 接口 */
    Interface = 'interface',
    /** 类 */
    Class = 'class',
    /** 模块 */
    Module = 'module',
    /** 文件路径 */
    FilePath = 'file-path',
    /** 片段 */
    Snippet = 'snippet'
}

/** 完成项元数据 */
export interface CompletionItemMetadata {
    /** 来源 */
    source: CompletionItemSource;
    /** 优先级 */
    priority: number;
    /** 可靠性 */
    confidence: number;
    /** 最后使用时间 */
    lastUsed?: number;
    /** 使用次数 */
    useCount: number;
    /** 标签 */
    tags: string[];
    /** 类别 */
    category?: string;
    /** 模块 */
    module?: string;
    /** 文档URI */
    documentUri?: string;
    /** 定义位置 */
    definition?: {
        uri: string;
        range: Range;
    };
}

/** 扩展的完成项 */
export interface ExtendedCompletionItem extends CompletionItem {
    /** 元数据 */
    metadata?: CompletionItemMetadata;
    /** 原始符号 */
    symbol?: PureBasicSymbol;
    /** 匹配分数 */
    matchScore?: number;
    /** 排序顺序 */
    sortText?: string;
    /** 过滤文本 */
    filterText?: string;
    /** 插入文本 */
    insertText?: string;
    /** 插入模式 */
    insertTextFormat?: InsertTextFormat;
    /** 插入位置 */
    insertPosition?: 'Replace' | 'After' | 'Before';
    /** 额外编辑 */
    additionalTextEdits?: CompletionTextEdit[];
    /** 命令 */
    command?: CompletionCommand;
    /** 文档 */
    documentation?: CompletionDocumentation;
    /** 前置条件 */
    preconditions?: CompletionCondition[];
    /** 后置条件 */
    postconditions?: CompletionCondition[];
}

/** 完成文本编辑 */
export interface CompletionTextEdit {
    /** 范围 */
    range: Range;
    /** 新文本 */
    newText: string;
    /** 编辑类型 */
    editType?: 'Insert' | 'Replace' | 'Delete';
}

/** 完成命令 */
export interface CompletionCommand {
    /** 命令 */
    command: string;
    /** 标题 */
    title: string;
    /** 参数 */
    arguments?: any[];
    /** 当 */
    when?: string;
}

/** 完成文档 */
export interface CompletionDocumentation {
    /** 文档类型 */
    kind: 'plaintext' | 'markdown';
    /** 内容 */
    value: string;
    /** 示例 */
    examples?: CompletionExample[];
    /** 相关链接 */
    relatedLinks?: CompletionLink[];
}

/** 完成示例 */
export interface CompletionExample {
    /** 描述 */
    description: string;
    /** 代码 */
    code: string;
    /** 语言 */
    language?: string;
    /** 输出 */
    output?: string;
}

/** 完成链接 */
export interface CompletionLink {
    /** 标题 */
    title: string;
    /** URL */
    url: string;
    /** 描述 */
    description?: string;
}

/** 完成条件 */
export interface CompletionCondition {
    /** 条件类型 */
    type: 'context' | 'syntax' | 'semantic' | 'custom';
    /** 条件描述 */
    description: string;
    /** 检查函数 */
    check: (context: CompletionContext) => boolean;
    /** 错误消息 */
    errorMessage?: string;
}

/** 完成提供者 */
export interface CompletionProvider {
    /** 提供者名称 */
    name: string;
    /** 提供完成项 */
    provideCompletionItems(
        document: TextDocument,
        position: Position,
        context: CompletionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedCompletionItem[], Error>;
    /** 解析完成项 */
    resolveCompletionItem?(
        item: ExtendedCompletionItem,
        token: CancellationToken
    ): AsyncResult<ExtendedCompletionItem, Error>;
    /** 是否支持给定文档 */
    supports(document: TextDocument): boolean;
    /** 获取优先级 */
    getPriority?(context: CompletionContext): number;
    /** 获取触发字符 */
    getTriggerCharacters?(): string[];
    /** 重置状态 */
    reset?(): void;
}

/** 完成项提取器 */
export interface CompletionExtractor {
    /** 提取器名称 */
    name: string;
    /** 提取类型 */
    type: CompletionItemSource;
    /** 提取完成项 */
    extract(
        document: TextDocument,
        position: Position,
        context: CompletionContext,
        token: CancellationToken
    ): AsyncResult<ExtendedCompletionItem[], Error>;
    /** 是否启用 */
    isEnabled(context: CompletionContext): boolean;
    /** 获取优先级 */
    getPriority(): number;
}

/** 完成项工厂 */
export interface CompletionFactory {
    /** 创建完成项 */
    createFromSymbol(symbol: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建关键字完成项 */
    createKeywordCompletion(keyword: string, context: CompletionContext): ExtendedCompletionItem;
    /** 创建函数完成项 */
    createFunctionCompletion(func: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建变量完成项 */
    createVariableCompletion(variable: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建常量完成项 */
    createConstantCompletion(constant: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建模块完成项 */
    createModuleCompletion(module: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建结构完成项 */
    createStructureCompletion(structure: PureBasicSymbol, context: CompletionContext): ExtendedCompletionItem;
    /** 创建片段完成项 */
    createSnippetCompletion(snippet: CompletionSnippet, context: CompletionContext): ExtendedCompletionItem;
    /** 自定义完成项 */
    createCustomCompletion(data: any, context: CompletionContext): ExtendedCompletionItem;
}

/** 完成片段 */
export interface CompletionSnippet {
    /** 前缀 */
    prefix: string;
    /** 描述 */
    description: string;
    /** 代码体 */
    body: string;
    /** 作用域 */
    scope?: string;
    /** 语言 */
    language?: string;
    /** 标签 */
    tags?: string[];
    /** 上下文 */
    context?: string[];
}

/** 完成配置 */
export interface CompletionConfig {
    /** 是否启用 */
    enabled: boolean;
    /** 触发字符 */
    triggerCharacters: string[];
    /** 自动显示建议 */
    suggestOnTriggerCharacters: boolean;
    /** 延迟时间（毫秒） */
    delay: number;
    /** 最大项目数 */
    maxItems: number;
    /** 最小前缀长度 */
    minPrefixLength: number;
    /** 过滤配置 */
    filter: ProviderCompletionFilterConfig;
    /** 排序配置 */
    sort: ProviderCompletionSortConfig;
    /** 分组配置 */
    group: CompletionGroupConfig;
    /** 提供者配置 */
    providers: CompletionProviderConfig[];
}

/** 完成过滤配置 */
export interface ProviderCompletionFilterConfig extends CoreCompletionFilterConfig {
    /** 自定义过滤器 */
    customFilters?: CustomFilter[];
}

/** 自定义过滤器 */
export interface CustomFilter {
    /** 过滤器名称 */
    name: string;
    /** 过滤函数 */
    filter: (item: ExtendedCompletionItem, context: CompletionContext) => boolean;
    /** 优先级 */
    priority: number;
}

/** 完成排序配置 */
export interface ProviderCompletionSortConfig extends CoreCompletionSortConfig {
    /** 自定义排序器 */
    customSorters?: CustomSorter[];
}

/** 自定义排序器 */
export interface CustomSorter {
    /** 排序器名称 */
    name: string;
    /** 排序函数 */
    sort: (items: ExtendedCompletionItem[], context: CompletionContext) => ExtendedCompletionItem[];
    /** 优先级 */
    priority: number;
}

/** 完成分组配置 */
export interface CompletionGroupConfig {
    /** 启用分组 */
    enabled: boolean;
    /** 分组字段 */
    groupBy: GroupByField[];
    /** 分组排序 */
    groupOrder: GroupOrder[];
    /** 显示组标题 */
    showGroupTitles: boolean;
    /** 可折叠组 */
    collapsibleGroups: boolean;
    /** 默认展开 */
    defaultExpanded: boolean;
}

/** 分组字段 */
export enum GroupByField {
    /** 类型 */
    Kind = 'kind',
    /** 来源 */
    Source = 'source',
    /** 模块 */
    Module = 'module',
    /** 类别 */
    Category = 'category',
    /** 作用域 */
    Scope = 'scope'
}

/** 分组顺序 */
export enum GroupOrder {
    /** 类型优先 */
    KindPriority = 'kind-priority',
    /** 来源优先 */
    SourcePriority = 'source-priority',
    /** 字母顺序 */
    Alphabetical = 'alphabetical',
    /** 优先级 */
    Priority = 'priority'
}

/** 完成提供者配置 */
export interface CompletionProviderConfig {
    /** 提供者名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 优先级 */
    priority: number;
    /** 触发字符 */
    triggerCharacters?: string[];
    /** 语言 */
    languages?: string[];
    /** 文件模式 */
    filePatterns?: string[];
    /** 作用域 */
    scopes?: string[];
    /** 配置选项 */
    options?: Record<string, unknown>;
}

/** 完成统计 */
export interface CompletionStats {
    /** 请求总数 */
    totalRequests: number;
    /** 成功请求数 */
    successfulRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 平均响应时间 */
    averageResponseTime: number;
    /** 平均项目数 */
    averageItemsPerRequest: number;
    /** 缓存命中率 */
    cacheHitRate: number;
    /** 按提供者统计 */
    byProvider: Record<string, ProviderStats>;
    /** 按类型统计 */
    byType: Record<string, number>;
    /** 按来源统计 */
    bySource: Record<string, number>;
}

/** 提供者统计 */
export interface ProviderStats {
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
    /** 平均项目数 */
    averageItems: number;
    /** 缓存命中率 */
    cacheHitRate: number;
}

/** 完成缓存项 */
export interface CompletionCacheItem {
    /** 键 */
    key: string;
    /** 完成项 */
    items: ExtendedCompletionItem[];
    /** 上下文 */
    context: CompletionContext;
    /** 过期时间 */
    expiresAt: number;
    /** 创建时间 */
    createdAt: number;
    /** 使用次数 */
    useCount: number;
    /** 最后使用时间 */
    lastUsed: number;
}