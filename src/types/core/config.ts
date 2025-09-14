/**
 * 配置相关类型定义
 */

/** PureBasic语言服务器设置 */
export interface PureBasicSettings {
    /** 最大问题数量 */
    maxNumberOfProblems: number;
    /** 是否启用验证 */
    enableValidation: boolean;
    /** 是否启用代码补全 */
    enableCompletion: boolean;
    /** 验证延迟（毫秒） */
    validationDelay: number;
    /** 高级配置 */
    advanced?: AdvancedSettings;
    /** 诊断配置 */
    diagnostics?: DiagnosticSettings;
    /** 补全配置 */
    completion?: CompletionSettings;
    /** 性能配置 */
    performance?: PerformanceSettings;
    /** 包含模式 */
    includePatterns?: string[];
}

/** 高级设置 */
export interface AdvancedSettings {
    /** 是否启用语义令牌 */
    enableSemanticTokens?: boolean;
    /** 是否启用代码镜头 */
    enableCodeLens?: boolean;
    /** 最大文件大小（字节） */
    maxFileSize?: number;
    /** 排除模式 */
    excludePatterns?: string[];
    /** 包含模式 */
    includePatterns?: string[];
    /** 工作区设置 */
    workspace?: WorkspaceSettings;
}

/** 工作区设置 */
export interface WorkspaceSettings {
    /** 库路径 */
    libraryPaths?: string[];
    /** 包含路径 */
    includePaths?: string[];
    /** 编译器路径 */
    compilerPath?: string;
    /** 构建脚本 */
    buildScript?: string;
    /** 环境变量 */
    environmentVariables?: Record<string, string>;
}

/** 诊断设置 */
export interface DiagnosticSettings {
    /** 是否启用语法检查 */
    enableSyntax?: boolean;
    /** 是否启用语义检查 */
    enableSemantic?: boolean;
    /** 是否启用风格检查 */
    enableStyle?: boolean;
    /** 是否自动修复 */
    autoFix?: boolean;
    /** 诊断延迟 */
    delay?: number;
    /** 规则配置 */
    rules?: Record<string, RuleConfig>;
}

/** 规则配置 */
export interface RuleConfig {
    /** 是否启用 */
    enabled?: boolean;
    /** 严重程度 */
    severity?: 'error' | 'warning' | 'info' | 'hint';
    /** 规则选项 */
    options?: Record<string, unknown>;
}

/** 补全设置 */
export interface CompletionSettings {
    /** 是否启用自动补全 */
    enableAutoComplete?: boolean;
    /** 是否启用补全详情 */
    showDetails?: boolean;
    /** 是否启用补全文档 */
    showDocumentation?: boolean;
    /** 最大补全项数量 */
    maxItems?: number;
    /** 触发字符 */
    triggerCharacters?: string[];
    /** 排除模式 */
    excludePatterns?: string[];
    /** 补全源配置 */
    sources?: CompletionSourceConfig[];
}

/** 补全源配置 */
export interface CompletionSourceConfig {
    /** 源名称 */
    name: string;
    /** 是否启用 */
    enabled: boolean;
    /** 优先级 */
    priority: number;
    /** 最大结果数 */
    maxResults?: number;
    /** 过滤配置 */
    filter?: CompletionFilterConfig;
}

/** 补全过滤配置 */
export interface CompletionFilterConfig {
    /** 是否启用智能过滤 */
    enableSmartFilter?: boolean;
    /** 模糊匹配阈值 */
    fuzzyThreshold?: number;
    /** 是否过滤重复项 */
    removeDuplicates?: boolean;
    /** 排序配置 */
    sort?: CompletionSortConfig;
}

/** 补全排序配置 */
export interface CompletionSortConfig {
    /** 排序字段 */
    fields: SortField[];
    /** 升序还是降序 */
    order: 'asc' | 'desc';
}

/** 排序字段 */
export type SortField =
    | 'name'
    | 'type'
    | 'relevance'
    | 'frequency'
    | 'recency'
    | 'priority';

/** 性能设置 */
export interface PerformanceSettings {
    /** 是否启用缓存 */
    enableCache?: boolean;
    /** 缓存大小限制 */
    cacheSizeLimit?: number;
    /** 缓存TTL（毫秒） */
    cacheTTL?: number;
    /** 是否启用增量解析 */
    enableIncrementalParse?: boolean;
    /** 是否启用并行处理 */
    enableParallelProcessing?: boolean;
    /** 并发限制 */
    concurrencyLimit?: number;
    /** 内存限制（MB） */
    memoryLimit?: number;
}

/** 配置验证结果 */
export interface ConfigValidationResult {
    /** 是否有效 */
    isValid: boolean;
    /** 错误信息 */
    errors: ConfigError[];
    /** 警告信息 */
    warnings: ConfigWarning[];
}

/** 配置错误 */
export interface ConfigError {
    /** 错误路径 */
    path: string;
    /** 错误消息 */
    message: string;
    /** 错误值 */
    value?: unknown;
}

/** 配置警告 */
export interface ConfigWarning {
    /** 警告路径 */
    path: string;
    /** 警告消息 */
    message: string;
    /** 警告值 */
    value?: unknown;
}

/** 配置变更事件 */
export interface ConfigChangeEvent {
    /** 变更的设置 */
    changes: ConfigChange[];
    /** 变更时间 */
    timestamp: number;
}

/** 配置变更 */
export interface ConfigChange {
    /** 配置路径 */
    path: string;
    /** 旧值 */
    oldValue?: unknown;
    /** 新值 */
    newValue?: unknown;
    /** 变更类型 */
    type: ConfigChangeType;
}

/** 配置变更类型 */
export enum ConfigChangeType {
    /** 添加 */
    Add = 'add',
    /** 更新 */
    Update = 'update',
    /** 删除 */
    Delete = 'delete'
}

/** 配置提供者 */
export interface ConfigProvider {
    /** 获取配置 */
    getConfig<T>(section: string): T | undefined;
    /** 监听配置变更 */
    onDidChange(callback: (event: ConfigChangeEvent) => void): Disposable;
    /** 更新配置 */
    updateConfig(section: string, value: unknown): Promise<void>;
}

/** 可释放资源 */
export interface Disposable {
    /** 释放资源 */
    dispose(): void;
}