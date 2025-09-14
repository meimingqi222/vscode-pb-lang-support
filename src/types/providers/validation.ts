/**
 * 验证提供者相关类型定义
 */

import { TextDocument, Position, Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { CancellationToken } from '../utils/generics';
import { Result, AsyncResult } from '../utils/generics';
import { ExtendedDiagnostic } from '../core/diagnostic';

/** 验证上下文 */
export interface ValidationContext {
    /** 文档 */
    document: TextDocument;
    /** 文本内容 */
    text: string;
    /** 行数 */
    lineCount: number;
    /** 文件URI */
    uri: string;
    /** 语言ID */
    languageId: string;
    /** 版本 */
    version: number;
    /** 验证范围 */
    range?: Range;
    /** 是否完全验证 */
    isFullValidation: boolean;
    /** 验证级别 */
    validationLevel: ValidationLevel;
    /** 规则配置 */
    rules: ValidationRuleConfig[];
    /** 排除模式 */
    excludePatterns: string[];
}

/** 验证级别 */
export enum ValidationLevel {
    /** 快速验证 */
    Quick = 'quick',
    /** 标准验证 */
    Standard = 'standard',
    /** 完整验证 */
    Full = 'full',
    /** 严格验证 */
    Strict = 'strict'
}

/** 验证规则配置 */
export interface ValidationRuleConfig {
    /** 规则ID */
    id: string;
    /** 规则名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 严重程度 */
    severity: DiagnosticSeverity;
    /** 规则类型 */
    type: ValidationRuleType;
    /** 规则选项 */
    options?: Record<string, unknown>;
    /** 规则描述 */
    description?: string;
    /** 标签 */
    tags?: string[];
    /** 文件模式 */
    filePatterns?: string[];
    /** 语言 */
    languages?: string[];
}

/** 验证规则类型 */
export enum ValidationRuleType {
    /** 语法规则 */
    Syntax = 'syntax',
    /** 语义规则 */
    Semantic = 'semantic',
    /** 风格规则 */
    Style = 'style',
    /** 性能规则 */
    Performance = 'performance',
    /** 安全规则 */
    Security = 'security',
    /** 最佳实践 */
    BestPractice = 'best-practice',
    /** 代码质量 */
    CodeQuality = 'code-quality',
    /** 可维护性 */
    Maintainability = 'maintainability',
    /** 可读性 */
    Readability = 'readability'
}

/** 验证结果 */
export interface ValidationResult {
    /** 诊断信息 */
    diagnostics: ExtendedDiagnostic[];
    /** 统计信息 */
    stats: ValidationStats;
    /** 上下文 */
    context: ValidationContext;
    /** 验证时间 */
    validationTime: number;
    /** 规则结果 */
    ruleResults: ValidationRuleResult[];
}

/** 验证统计 */
export interface ValidationStats {
    /** 总诊断数 */
    totalDiagnostics: number;
    /** 按严重程度分类 */
    bySeverity: Record<DiagnosticSeverity, number>;
    /** 按规则分类 */
    byRule: Record<string, number>;
    /** 按类型分类 */
    byType: Record<ValidationRuleType, number>;
    /** 按文件分类 */
    byFile: Record<string, number>;
    /** 规则执行数 */
    executedRules: number;
    /** 跳过规则数 */
    skippedRules: number;
    /** 失败规则数 */
    failedRules: number;
    /** 平均规则执行时间 */
    averageRuleExecutionTime: number;
}

/** 验证规则结果 */
export interface ValidationRuleResult {
    /** 规则ID */
    ruleId: string;
    /** 规则名称 */
    ruleName: string;
    /** 是否成功 */
    success: boolean;
    /** 诊断数 */
    diagnosticsCount: number;
    /** 执行时间 */
    executionTime: number;
    /** 错误信息 */
    error?: string;
    /** 警告信息 */
    warnings?: string[];
}

/** 验证提供者 */
export interface ValidationProvider {
    /** 提供者名称 */
    name: string;
    /** 提供验证 */
    provideValidation(
        document: TextDocument,
        context: ValidationContext,
        token: CancellationToken
    ): AsyncResult<ValidationResult, Error>;
    /** 是否支持给定文档 */
    supports(document: TextDocument): boolean;
    /** 获取优先级 */
    getPriority?(context: ValidationContext): number;
    /** 获取支持的语言 */
    getSupportedLanguages?(): string[];
    /** 获取支持的规则类型 */
    getSupportedRuleTypes?(): ValidationRuleType[];
    /** 重置状态 */
    reset?(): void;
}

/** 验证规则 */
export interface ValidationRule {
    /** 规则ID */
    id: string;
    /** 规则名称 */
    name: string;
    /** 规则描述 */
    description: string;
    /** 规则类型 */
    type: ValidationRuleType;
    /** 严重程度 */
    severity: DiagnosticSeverity;
    /** 规则函数 */
    validate: (context: ValidationContext, token: CancellationToken) => AsyncResult<ExtendedDiagnostic[], Error>;
    /** 是否支持给定文档 */
    supports: (document: TextDocument) => boolean;
    /** 规则选项 */
    options?: Record<string, unknown>;
    /** 标签 */
    tags?: string[];
    /** 文件模式 */
    filePatterns?: string[];
    /** 语言 */
    languages?: string[];
    /** 依赖规则 */
    dependencies?: string[];
    /** 排除规则 */
    excludes?: string[];
}

/** 验证配置 */
export interface ValidationConfig {
    /** 是否启用 */
    enabled: boolean;
    /** 验证延迟（毫秒） */
    delay: number;
    /** 最大诊断数 */
    maxDiagnostics: number;
    /** 启用缓存 */
    enableCache: boolean;
    /** 缓存大小 */
    cacheSize: number;
    /** 缓存过期时间（毫秒） */
    cacheTTL: number;
    /** 启用并行验证 */
    enableParallel: boolean;
    /** 最大并行数 */
    maxParallel: number;
    /** 超时时间（毫秒） */
    timeout: number;
    /** 验证级别 */
    validationLevel: ValidationLevel;
    /** 默认严重程度 */
    defaultSeverity: DiagnosticSeverity;
    /** 规则配置 */
    rules: ValidationRuleConfig[];
    /** 提供者配置 */
    providers: ValidationProviderConfig[];
}

/** 验证提供者配置 */
export interface ValidationProviderConfig {
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
    /** 规则类型 */
    ruleTypes?: ValidationRuleType[];
    /** 配置选项 */
    options?: Record<string, unknown>;
}

/** 验证缓存项 */
export interface ValidationCacheItem {
    /** 键 */
    key: string;
    /** 验证结果 */
    result: ValidationResult;
    /** 文档版本 */
    documentVersion: number;
    /** 文档哈希 */
    documentHash: string;
    /** 过期时间 */
    expiresAt: number;
    /** 创建时间 */
    createdAt: number;
    /** 使用次数 */
    useCount: number;
    /** 最后使用时间 */
    lastUsed: number;
}

/** 验证进度 */
export interface ValidationProgress {
    /** 总文件数 */
    totalFiles: number;
    /** 已验证文件数 */
    validatedFiles: number;
    /** 当前文件 */
    currentFile?: string;
    /** 当前规则 */
    currentRule?: string;
    /** 进度百分比 */
    progress: number;
    /** 开始时间 */
    startTime: number;
    /** 预计剩余时间 */
    estimatedTimeRemaining?: number;
    /** 已用时间 */
    elapsedTime: number;
}

/** 验证报告 */
export interface ValidationReport {
    /** 报告ID */
    id: string;
    /** 创建时间 */
    createdAt: number;
    /** 验证时间 */
    validationTime: number;
    /** 文件列表 */
    files: ValidationFileReport[];
    /** 统计信息 */
    stats: ValidationStats;
    /** 配置 */
    config: ValidationConfig;
    /** 错误信息 */
    errors?: string[];
}

/** 验证文件报告 */
export interface ValidationFileReport {
    /** 文件URI */
    uri: string;
    /** 文件路径 */
    path: string;
    /** 诊断数 */
    diagnosticsCount: number;
    /** 验证时间 */
    validationTime: number;
    /** 规则结果 */
    ruleResults: ValidationRuleResult[];
}

/** 验证错误 */
export interface ValidationError extends Error {
    /** 错误类型 */
    type: ValidationErrorType;
    /** 文件URI */
    fileUri?: string;
    /** 位置 */
    position?: Position;
    /** 规则ID */
    ruleId?: string;
    /** 严重程度 */
    severity?: DiagnosticSeverity;
    /** 上下文 */
    context?: ValidationContext;
}

/** 验证错误类型 */
export enum ValidationErrorType {
    /** 规则执行错误 */
    RuleExecution = 'rule-execution',
    /** 配置错误 */
    Configuration = 'configuration',
    /** 解析错误 */
    Parsing = 'parsing',
    /** 超时错误 */
    Timeout = 'timeout',
    /** 内存不足 */
    OutOfMemory = 'out-of-memory',
    /** 取消错误 */
    Cancellation = 'cancellation',
    /** 未知错误 */
    Unknown = 'unknown'
}