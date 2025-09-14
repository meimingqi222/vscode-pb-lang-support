/**
 * 诊断相关类型定义
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

/** 扩展的诊断信息 */
export interface ExtendedDiagnostic extends Diagnostic {
    /** 诊断ID */
    id?: string;
    /** 源文件 */
    sourceFile?: string;
    /** 规则ID */
    ruleId?: string;
    /** 规则名称 */
    ruleName?: string;
    /** 修复建议 */
    fixes?: DiagnosticFix[];
    /** 相关诊断 */
    related?: RelatedDiagnostic[];
    /** 数据 */
    data?: unknown;
    /** 标签 */
    tags?: DiagnosticTag[];
    /** 优先级 */
    priority?: DiagnosticPriority;
    /** 可靠性 */
    confidence?: number;
}

/** 诊断修复建议 */
export interface DiagnosticFix {
    /** 修复标题 */
    title: string;
    /** 修复操作 */
    edit: WorkspaceEdit;
    /** 修复类型 */
    kind: FixKind;
    /** 是否首选修复 */
    isPreferred?: boolean;
}

/** 工作区编辑 */
export interface WorkspaceEdit {
    /** 文档变更 */
    changes?: DiagnosticDocumentChange[];
    /** 文档创建 */
    documentChanges?: DiagnosticDocumentChange[];
}

/** 诊断文档变更 */
export interface DiagnosticDocumentChange {
    /** 文档URI */
    uri: string;
    /** 版本 */
    version?: number;
    /** 文本编辑 */
    edits: TextEdit[];
}

/** 文本编辑 */
export interface TextEdit {
    /** 范围 */
    range: Range;
    /** 新文本 */
    newText: string;
}

/** 修复类型 */
export enum FixKind {
    /** 快速修复 */
    QuickFix = 'quick-fix',
    /** 重构 */
    Refactor = 'refactor',
    /** 重构提取 */
    RefactorExtract = 'refactor.extract',
    /** 重构内联 */
    RefactorInline = 'refactor.inline',
    /** 重构重写 */
    RefactorRewrite = 'refactor.rewrite',
    /** 源代码操作 */
    Source = 'source',
    /** 源代码组织导入 */
    SourceOrganizeImports = 'source.organizeImports',
    /** 源代码修复所有 */
    SourceFixAll = 'source.fixAll'
}

/** 相关诊断 */
export interface RelatedDiagnostic {
    /** 位置 */
    location: DiagnosticLocation;
    /** 消息 */
    message: string;
    /** 严重程度 */
    severity?: DiagnosticSeverity;
}

/** 诊断位置 */
export interface DiagnosticLocation {
    /** URI */
    uri: string;
    /** 范围 */
    range: Range;
}

/** 诊断标签 */
export enum DiagnosticTag {
    /** 不必要的代码 */
    Unnecessary = 1,
    /** 已弃用 */
    Deprecated = 2
}

/** 诊断优先级 */
export enum DiagnosticPriority {
    /** 高 */
    High = 1,
    /** 中 */
    Medium = 2,
    /** 低 */
    Low = 3
}

/** 诊断规则 */
export interface DiagnosticRule {
    /** 规则ID */
    id: string;
    /** 规则名称 */
    name: string;
    /** 规则描述 */
    description: string;
    /** 严重程度 */
    severity: DiagnosticSeverity;
    /** 是否启用 */
    enabled: boolean;
    /** 规则类型 */
    type: RuleType;
    /** 标签 */
    tags: string[];
    /** 修复建议 */
    fixes?: RuleFix[];
    /** 配置选项 */
    options?: Record<string, unknown>;
}

/** 规则类型 */
export enum RuleType {
    /** 语法错误 */
    Syntax = 'syntax',
    /** 语义错误 */
    Semantic = 'semantic',
    /** 风格问题 */
    Style = 'style',
    /** 性能问题 */
    Performance = 'performance',
    /** 安全问题 */
    Security = 'security',
    /** 最佳实践 */
    BestPractice = 'best-practice'
}

/** 规则修复建议 */
export interface RuleFix {
    /** 修复标题 */
    title: string;
    /** 修复函数 */
    fix: (diagnostic: ExtendedDiagnostic) => WorkspaceEdit | Promise<WorkspaceEdit>;
    /** 修复类型 */
    kind: FixKind;
    /** 适用条件 */
    condition?: (diagnostic: ExtendedDiagnostic) => boolean;
}

/** 诊断配置 */
export interface DiagnosticConfig {
    /** 最大诊断数量 */
    maxDiagnostics: number;
    /** 是否启用语法检查 */
    enableSyntax: boolean;
    /** 是否启用语义检查 */
    enableSemantic: boolean;
    /** 是否启用风格检查 */
    enableStyle: boolean;
    /** 是否自动修复 */
    autoFix: boolean;
    /** 诊断延迟（毫秒） */
    delay: number;
    /** 规则配置 */
    rules: Record<string, DiagnosticRuleConfig>;
    /** 文件排除模式 */
    excludePatterns: string[];
}

/** 诊断规则配置 */
export interface DiagnosticRuleConfig {
    /** 是否启用 */
    enabled: boolean;
    /** 严重程度 */
    severity?: DiagnosticSeverity;
    /** 规则选项 */
    options?: Record<string, unknown>;
}

/** 诊断提供者 */
export interface DiagnosticProvider {
    /** 提供者名称 */
    name: string;
    /** 提供诊断 */
    provideDiagnostics(document: TextDocument, config: DiagnosticConfig): Promise<ExtendedDiagnostic[]>;
    /** 提供修复建议 */
    provideFixes?(diagnostic: ExtendedDiagnostic): Promise<DiagnosticFix[]>;
    /** 是否支持给定文档 */
    supports(document: TextDocument): boolean;
}

/** 诊断收集器 */
export interface DiagnosticCollector {
    /** 添加诊断 */
    addDiagnostic(diagnostic: ExtendedDiagnostic): void;
    /** 添加相关诊断 */
    addRelatedDiagnostic(mainDiagnostic: ExtendedDiagnostic, related: RelatedDiagnostic): void;
    /** 清空调断 */
    clear(): void;
    /** 获取所有诊断 */
    getDiagnostics(): ExtendedDiagnostic[];
}

/** 诊断统计 */
export interface DiagnosticStats {
    /** 总诊断数 */
    totalDiagnostics: number;
    /** 按严重程度分类 */
    bySeverity: Record<DiagnosticSeverity, number>;
    /** 按规则分类 */
    byRule: Record<string, number>;
    /** 按文件分类 */
    byFile: Record<string, number>;
    /** 修复数 */
    fixes: number;
    /** 平均处理时间 */
    averageProcessingTime: number;
}