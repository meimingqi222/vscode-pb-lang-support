/**
 * 语言服务器相关类型定义
 */

import { TextDocument, Position, Range, CompletionItem, Definition, Hover, SignatureHelp, DocumentHighlight, DocumentSymbol, SymbolInformation, CodeLens, FormattingOptions, TextEdit, WorkspaceEdit, RenameParams, CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import { CancellationToken } from '../utils/generics';
import { Result, AsyncResult } from '../utils/generics';
import { ExtendedDiagnostic } from '../core/diagnostic';
import { ExtendedCompletionItem } from '../providers/completion';
import { ExtendedLocation } from '../providers/definition';
import { ExtendedHover } from '../providers/hover';
import { ValidationResult } from '../providers/validation';

/** 语言服务器配置 */
export interface LanguageServerConfig {
    /** 服务器名称 */
    name: string;
    /** 版本 */
    version: string;
    /** 支持的语言 */
    languages: string[];
    /** 初始化选项 */
    initializationOptions?: Record<string, unknown>;
    /** 客户端能力 */
    clientCapabilities?: ClientCapabilities;
    /** 服务器能力 */
    serverCapabilities?: ServerCapabilities;
    /** 提供者配置 */
    providers: ProviderConfig;
    /** 性能配置 */
    performance: PerformanceConfig;
    /** 调试配置 */
    debug: DebugConfig;
}

/** 客户端能力 */
export interface ClientCapabilities {
    /** 文档同步 */
    textDocument?: {
        /** 同步类型 */
        synchronization?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持保存 */
            willSave?: boolean;
            /** 是否支持保存前询问 */
            willSaveWaitUntil?: boolean;
            /** 是否支持完全同步 */
            didSave?: boolean;
        };
        /** 完成 */
        completion?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持上下文 */
            contextSupport?: boolean;
            /** 完成项类型 */
            completionItem?: {
                /** 是否支持插入文本格式 */
                snippetSupport?: boolean;
                /** 是否支持提交字符 */
                commitCharactersSupport?: boolean;
                /** 是否支持文档格式 */
                documentationFormat?: string[];
                /** 是否支持废弃标签 */
                deprecatedSupport?: boolean;
                /** 是否支持预选 */
                preselectSupport?: boolean;
            };
            /** 是否支持完成项标签 */
            completionItemKind?: {
                /** 支持的值集 */
                valueSet?: CompletionItemKind[];
            };
        };
        /** 悬停 */
        hover?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 支持的内容格式 */
            contentFormat?: string[];
        };
        /** 定义 */
        definition?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持链接定义 */
            linkSupport?: boolean;
        };
        /** 类型定义 */
        typeDefinition?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持链接定义 */
            linkSupport?: boolean;
        };
        /** 实现 */
        implementation?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持链接定义 */
            linkSupport?: boolean;
        };
        /** 引用 */
        references?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 文档高亮 */
        documentHighlight?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 文档符号 */
        documentSymbol?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持符号类型 */
            symbolKind?: {
                /** 支持的值集 */
                valueSet?: SymbolKind[];
            };
            /** 是否支持分层文档符号 */
            hierarchicalDocumentSymbolSupport?: boolean;
        };
        /** 格式化 */
        formatting?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 范围格式化 */
        rangeFormatting?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 输入格式化 */
        onTypeFormatting?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 重命名 */
        rename?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持准备重命名 */
            prepareSupport?: boolean;
        };
        /** 代码镜头 */
        codeLens?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 签名帮助 */
        signatureHelp?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 签名信息 */
            signatureInformation?: {
                /** 支持的文档格式 */
                documentationFormat?: string[];
                /** 参数信息 */
                parameterInformation?: {
                    /** 是否支持标签偏移 */
                    labelOffsetSupport?: boolean;
                };
            };
        };
    };
    /** 工作区 */
    workspace?: {
        /** 文档更改 */
        applyEdit?: boolean;
        /** 工作区编辑 */
        workspaceEdit?: {
            /** 文档更改 */
            documentChanges?: boolean;
        };
        /** 工作区符号 */
        symbol?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
            /** 是否支持符号类型 */
            symbolKind?: {
                /** 支持的值集 */
                valueSet?: SymbolKind[];
            };
        };
        /** 执行命令 */
        executeCommand?: {
            /** 是否支持动态注册 */
            dynamicRegistration?: boolean;
        };
        /** 配置 */
        configuration?: boolean;
        /** 工作区文件夹 */
        workspaceFolders?: boolean;
    };
    /** 窗口 */
    window?: {
        /** 显示消息 */
        showMessage?: {
            /** 消息类型 */
            messageActionItem?: {
                /** 支持的操作 */
                additionalPropertiesSupport?: boolean;
            };
        };
        /** 显示文档 */
        showDocument?: {
            /** 是否支持 */
            support?: boolean;
        };
        /** 进度 */
        workDoneProgress?: boolean;
    };
}

/** 服务器能力 */
export interface ServerCapabilities {
    /** 文档同步 */
    textDocumentSync?: TextDocumentSyncOptions | number;
    /** 完成 */
    completionProvider?: CompletionOptions;
    /** 悬停 */
    hoverProvider?: boolean | HoverOptions;
    /** 定义 */
    definitionProvider?: boolean | DefinitionOptions;
    /** 类型定义 */
    typeDefinitionProvider?: boolean | TypeDefinitionOptions;
    /** 实现 */
    implementationProvider?: boolean | ImplementationOptions;
    /** 引用 */
    referencesProvider?: boolean | ReferenceOptions;
    /** 文档高亮 */
    documentHighlightProvider?: boolean | DocumentHighlightOptions;
    /** 文档符号 */
    documentSymbolProvider?: boolean | DocumentSymbolOptions;
    /** 格式化 */
    documentFormattingProvider?: boolean | DocumentFormattingOptions;
    /** 范围格式化 */
    documentRangeFormattingProvider?: boolean | DocumentRangeFormattingOptions;
    /** 输入格式化 */
    documentOnTypeFormattingProvider?: DocumentOnTypeFormattingOptions;
    /** 重命名 */
    renameProvider?: boolean | RenameOptions;
    /** 代码镜头 */
    codeLensProvider?: CodeLensOptions;
    /** 签名帮助 */
    signatureHelpProvider?: SignatureHelpOptions;
    /** 工作区符号 */
    workspaceSymbolProvider?: boolean | WorkspaceSymbolOptions;
    /** 执行命令 */
    executeCommandProvider?: ExecuteCommandOptions;
    /** 工作区文件夹 */
    workspaceFolders?: WorkspaceFoldersOptions;
    /** 语义令牌 */
    semanticTokensProvider?: SemanticTokensOptions | SemanticTokensRegistrationOptions;
    /** 代码操作 */
    codeActionProvider?: CodeActionOptions;
    /** 诊断 */
    diagnosticProvider?: DiagnosticRegistrationOptions;
    /** 类型层次结构 */
    typeHierarchyProvider?: boolean;
    /** 内联值 */
    inlineValueProvider?: boolean;
    /** 内联补全 */
    inlineCompletionProvider?: InlineCompletionOptions;
}

/** 提供者配置 */
export interface ProviderConfig {
    /** 完成提供者 */
    completion: import('../providers/completion').CompletionConfig;
    /** 定义提供者 */
    definition: import('../providers/definition').DefinitionConfig;
    /** 悬停提供者 */
    hover: import('../providers/hover').HoverConfig;
    /** 验证提供者 */
    validation: import('../providers/validation').ValidationConfig;
}

/** 性能配置 */
export interface PerformanceConfig {
    /** 是否启用缓存 */
    enableCache: boolean;
    /** 缓存大小 */
    cacheSize: number;
    /** 缓存过期时间（毫秒） */
    cacheTTL: number;
    /** 是否启用并行处理 */
    enableParallel: boolean;
    /** 最大并行数 */
    maxParallel: number;
    /** 超时时间（毫秒） */
    timeout: number;
    /** 是否启用性能监控 */
    enableProfiling: boolean;
    /** 性能统计间隔（毫秒） */
    statsInterval: number;
    /** 最大内存使用（字节） */
    maxMemoryUsage: number;
    /** 是否启用内存清理 */
    enableGarbageCollection: boolean;
    /** 垃圾回收间隔（毫秒） */
    gcInterval: number;
}

/** 调试配置 */
export interface DebugConfig {
    /** 是否启用调试模式 */
    enabled: boolean;
    /** 日志级别 */
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    /** 日志文件路径 */
    logFile?: string;
    /** 是否启用性能日志 */
    enablePerformanceLog: boolean;
    /** 是否启用详细日志 */
    verbose: boolean;
    /** 调试端口 */
    debugPort?: number;
    /** 是否启用调试协议 */
    enableDebugProtocol: boolean;
    /** 调试配置 */
    debugOptions?: Record<string, unknown>;
}

/** 语言服务器统计 */
export interface LanguageServerStats {
    /** 启动时间 */
    startupTime: number;
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
    /** 内存使用情况 */
    memoryUsage: MemoryUsage;
    /** 按请求类型统计 */
    byRequestType: Record<string, RequestStats>;
    /** 按提供者统计 */
    byProvider: Record<string, LanguageServerProviderStats>;
}

/** 内存使用情况 */
export interface MemoryUsage {
    /** 已使用内存 */
    used: number;
    /** 总内存 */
    total: number;
    /** 使用率 */
    usage: number;
    /** 缓存内存 */
    cache: number;
    /** 其他内存 */
    other: number;
}

/** 请求统计 */
export interface RequestStats {
    /** 请求数 */
    count: number;
    /** 成功数 */
    successful: number;
    /** 失败数 */
    failed: number;
    /** 平均时间 */
    averageTime: number;
    /** 最小时间 */
    minTime: number;
    /** 最大时间 */
    maxTime: number;
}

/** 语言服务器提供者统计 */
export interface LanguageServerProviderStats {
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
    /** 错误信息 */
    errors?: string[];
}

/** 语言服务器事件 */
export interface LanguageServerEvent {
    /** 事件类型 */
    type: LanguageServerEventType;
    /** 事件数据 */
    data: any;
    /** 时间戳 */
    timestamp: number;
    /** 来源 */
    source: string;
}

/** 语言服务器事件类型 */
export enum LanguageServerEventType {
    /** 服务器启动 */
    ServerStart = 'server-start',
    /** 服务器停止 */
    ServerStop = 'server-stop',
    /** 服务器错误 */
    ServerError = 'server-error',
    /** 客户端连接 */
    ClientConnect = 'client-connect',
    /** 客户端断开 */
    ClientDisconnect = 'client-disconnect',
    /** 文档打开 */
    DocumentOpen = 'document-open',
    /** 文档关闭 */
    DocumentClose = 'document-close',
    /** 文档更改 */
    DocumentChange = 'document-change',
    /** 文档保存 */
    DocumentSave = 'document-save',
    /** 请求开始 */
    RequestStart = 'request-start',
    /** 请求完成 */
    RequestComplete = 'request-complete',
    /** 请求错误 */
    RequestError = 'request-error',
    /** 缓存命中 */
    CacheHit = 'cache-hit',
    /** 缓存未命中 */
    CacheMiss = 'cache-miss',
    /** 性能警告 */
    PerformanceWarning = 'performance-warning',
    /** 内存警告 */
    MemoryWarning = 'memory-warning'
}

/** 语言服务器监听器 */
export interface LanguageServerListener {
    /** 处理事件 */
    (event: LanguageServerEvent): void | Promise<void>;
}

/** 语言服务器错误 */
export interface LanguageServerError extends Error {
    /** 错误类型 */
    type: LanguageServerErrorType;
    /** 错误代码 */
    code?: number;
    /** 请求ID */
    requestId?: string;
    /** 文档URI */
    documentUri?: string;
    /** 位置 */
    position?: Position;
    /** 上下文 */
    context?: Record<string, unknown>;
}

/** 语言服务器错误类型 */
export enum LanguageServerErrorType {
    /** 配置错误 */
    Configuration = 'configuration',
    /** 初始化错误 */
    Initialization = 'initialization',
    /** 提供者错误 */
    Provider = 'provider',
    /** 缓存错误 */
    Cache = 'cache',
    /** 并发错误 */
    Concurrency = 'concurrency',
    /** 内存错误 */
    Memory = 'memory',
    /** 超时错误 */
    Timeout = 'timeout',
    /** 取消错误 */
    Cancellation = 'cancellation',
    /** 协议错误 */
    Protocol = 'protocol',
    /** 未知错误 */
    Unknown = 'unknown'
}

// 这里需要导入LSP相关的选项类型，但由于这些类型已经在vscode-languageserver中定义，
// 我们使用import语句来避免重复定义
type CompletionOptions = import('vscode-languageserver').CompletionOptions;
type HoverOptions = import('vscode-languageserver').HoverOptions;
type DefinitionOptions = import('vscode-languageserver').DefinitionOptions;
type TypeDefinitionOptions = import('vscode-languageserver').TypeDefinitionOptions;
type ImplementationOptions = import('vscode-languageserver').ImplementationOptions;
type ReferenceOptions = import('vscode-languageserver').ReferenceOptions;
type DocumentHighlightOptions = import('vscode-languageserver').DocumentHighlightOptions;
type DocumentSymbolOptions = import('vscode-languageserver').DocumentSymbolOptions;
type DocumentFormattingOptions = import('vscode-languageserver').DocumentFormattingOptions;
type DocumentRangeFormattingOptions = import('vscode-languageserver').DocumentRangeFormattingOptions;
type DocumentOnTypeFormattingOptions = import('vscode-languageserver').DocumentOnTypeFormattingOptions;
type RenameOptions = import('vscode-languageserver').RenameOptions;
type CodeLensOptions = import('vscode-languageserver').CodeLensOptions;
type SignatureHelpOptions = import('vscode-languageserver').SignatureHelpOptions;
type WorkspaceSymbolOptions = import('vscode-languageserver').WorkspaceSymbolOptions;
type ExecuteCommandOptions = import('vscode-languageserver').ExecuteCommandOptions;
type WorkspaceFoldersOptions = any;
type SemanticTokensOptions = any;
type SemanticTokensRegistrationOptions = any;
type CodeActionOptions = any;
type DiagnosticRegistrationOptions = any;
type InlineCompletionOptions = any;
type TextDocumentSyncOptions = any;

// 重新导出类型以方便使用
export type {
    CompletionOptions,
    HoverOptions,
    DefinitionOptions,
    TypeDefinitionOptions,
    ImplementationOptions,
    ReferenceOptions,
    DocumentHighlightOptions,
    DocumentSymbolOptions,
    DocumentFormattingOptions,
    DocumentRangeFormattingOptions,
    DocumentOnTypeFormattingOptions,
    RenameOptions,
    CodeLensOptions,
    SignatureHelpOptions,
    WorkspaceSymbolOptions,
    ExecuteCommandOptions,
    WorkspaceFoldersOptions,
    SemanticTokensOptions,
    SemanticTokensRegistrationOptions,
    CodeActionOptions,
    DiagnosticRegistrationOptions,
    InlineCompletionOptions,
    TextDocumentSyncOptions
};