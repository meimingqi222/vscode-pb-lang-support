/**
 * Language Server 设置配置
 */

export interface PureBasicSettings {
    maxNumberOfProblems: number;
    enableValidation: boolean;
    enableCompletion: boolean;
    validationDelay: number;
    formatting?: FormattingSettings;
    completion?: CompletionSettings;
    linting?: LintingSettings;
    symbols?: SymbolsSettings;
    performance?: PerformanceSettings;
}

export interface FormattingSettings {
    /** 是否启用格式化 */
    enabled: boolean;
    /** 缩进大小 */
    indentSize: number;
    /** Tab大小 */
    tabSize: number;
    /** 是否插入空格 */
    insertSpaces: boolean;
    /** 是否删除尾部空格 */
    trimTrailingWhitespace: boolean;
    /** 是否删除末尾换行 */
    trimFinalNewlines: boolean;
}

export interface CompletionSettings {
    /** 触发字符 */
    triggerCharacters: string[];
    /** 是否启用自动闭合 */
    autoClosingPairs: boolean;
    /** 是否在输入时建议 */
    suggestOnType: boolean;
}

export interface LintingSettings {
    /** 是否启用语义验证 */
    enableSemanticValidation: boolean;
    /** 是否检查未使用变量 */
    checkUnusedVariables: boolean;
    /** 是否检查未定义符号 */
    checkUndefinedSymbols: boolean;
    /** 是否启用代码操作 */
    enableCodeActions: boolean;
}

export interface SymbolsSettings {
    /** 是否启用工作区符号 */
    enableWorkspaceSymbols: boolean;
    /** 是否启用符号缓存 */
    cacheEnabled: boolean;
    /** 缓存大小 */
    cacheSize: number;
}

export interface PerformanceSettings {
    /** 是否启用增量解析 */
    enableIncrementalParsing: boolean;
    /** 最大文件大小 */
    maxFileSize: number;
}

/**
 * 默认设置
 */
export const defaultSettings: PureBasicSettings = {
    maxNumberOfProblems: 100,
    enableValidation: true,
    enableCompletion: true,
    validationDelay: 500,
    formatting: {
        enabled: true,
        indentSize: 4,
        tabSize: 4,
        insertSpaces: true,
        trimTrailingWhitespace: true,
        trimFinalNewlines: true
    },
    completion: {
        triggerCharacters: ['.', '(', '['],
        autoClosingPairs: true,
        suggestOnType: true
    },
    linting: {
        enableSemanticValidation: true,
        checkUnusedVariables: true,
        checkUndefinedSymbols: true,
        enableCodeActions: true
    },
    symbols: {
        enableWorkspaceSymbols: true,
        cacheEnabled: true,
        cacheSize: 1000
    },
    performance: {
        enableIncrementalParsing: true,
        maxFileSize: 1048576 // 1MB
    }
};

/**
 * 全局设置（当没有工作区配置时使用）
 */
export let globalSettings: PureBasicSettings = defaultSettings;
