/**
 * 符号相关类型定义
 */

import { Range } from 'vscode-languageserver-textdocument';

/** 符号范围 */
export interface SymbolRange {
    /** 开始位置 */
    start: { line: number; character: number };
    /** 结束位置 */
    end: { line: number; character: number };
}

/** 扩展的PureBasic符号接口 */
export interface PureBasicSymbol {
    /** 符号名称 */
    name: string;
    /** 符号类型 */
    kind: SymbolKind;
    /** 定义范围 */
    range: SymbolRange;
    /** 详细信息 */
    detail?: string;
    /** 文档说明 */
    documentation?: string;
    /** 所属模块名称 */
    module?: string;
    /** 是否为公共符号 */
    isPublic?: boolean;
    /** 参数列表 */
    parameters?: string[];
    /** 返回类型 */
    returnType?: string;
    /** 符号ID（唯一标识） */
    id?: string;
    /** 父符号ID */
    parentId?: string;
    /** 子符号ID列表 */
    children?: string[];
    /** 标签 */
    tags?: SymbolTag[];
    /** 修饰符 */
    modifiers?: SymbolModifier[];
    /** 值（用于常量） */
    value?: string | number;
    /** 默认值（用于参数） */
    defaultValue?: string;
    /** 是否已弃用 */
    deprecated?: boolean;
}

/** 符号类型枚举 */
export enum SymbolKind {
    /** 过程 */
    Procedure = 'procedure',
    /** 变量 */
    Variable = 'variable',
    /** 常量 */
    Constant = 'constant',
    /** 结构体 */
    Structure = 'structure',
    /** 模块 */
    Module = 'module',
    /** 接口 */
    Interface = 'interface',
    /** 枚举 */
    Enumeration = 'enumeration',
    /** 函数 */
    Function = 'function',
    /** 关键字 */
    Keyword = 'keyword',
    /** 操作符 */
    Operator = 'operator',
    /** 参数 */
    Parameter = 'parameter',
    /** 类型别名 */
    TypeAlias = 'type-alias',
    /** 命名空间 */
    Namespace = 'namespace',
    /** 属性 */
    Property = 'property',
    /** 方法 */
    Method = 'method',
    /** 构造函数 */
    Constructor = 'constructor',
    /** 事件 */
    Event = 'event'
}

/** 符号标签 */
export enum SymbolTag {
    /** 已弃用 */
    Deprecated = 'deprecated',
    /** 只读 */
    Readonly = 'readonly',
    /** 静态 */
    Static = 'static',
    /** 抽象 */
    Abstract = 'abstract',
    /** 异步 */
    Async = 'async',
    /** 生成器 */
    Generator = 'generator'
}

/** 符号修饰符 */
export enum SymbolModifier {
    /** 公共 */
    Public = 'public',
    /** 私有 */
    Private = 'private',
    /** 保护 */
    Protected = 'protected',
    /** 静态 */
    Static = 'static',
    /** 抽象 */
    Abstract = 'abstract',
    /** 异步 */
    Async = 'async',
    /** 只读 */
    Readonly = 'readonly',
    /** 虚拟 */
    Virtual = 'virtual',
    /** 覆盖 */
    Override = 'override'
}

/** 符号引用信息 */
export interface SymbolReference {
    /** 符号ID */
    symbolId: string;
    /** 引用位置 */
    location: SymbolRange;
    /** 引用类型 */
    referenceType: ReferenceType;
    /** 文档URI */
    documentUri: string;
}

/** 引用类型 */
export enum ReferenceType {
    /** 定义 */
    Definition = 'definition',
    /** 声明 */
    Declaration = 'declaration',
    /** 引用 */
    Reference = 'reference',
    /** 类型引用 */
    TypeReference = 'type-reference',
    /** 继承 */
    Inheritance = 'inheritance',
    /** 实现 */
    Implementation = 'implementation'
}

/** 符号搜索选项 */
export interface SymbolSearchOptions {
    /** 搜索文本 */
    query: string;
    /** 搜索范围（文档URI列表） */
    scope?: string[];
    /** 符号类型过滤 */
    kinds?: SymbolKind[];
    /** 最大结果数 */
    maxResults?: number;
    /** 是否包含详细信息 */
    includeDetails?: boolean;
    /** 是否区分大小写 */
    caseSensitive?: boolean;
    /** 是否全词匹配 */
    wholeWord?: boolean;
}

/** 符号搜索结果 */
export interface SymbolSearchResult {
    /** 符号 */
    symbol: PureBasicSymbol;
    /** 匹配分数 */
    score: number;
    /** 文档URI */
    documentUri: string;
    /** 匹配位置 */
    matchRange?: SymbolRange;
}

/** 符号层次结构 */
export interface SymbolHierarchy {
    /** 根符号 */
    root: PureBasicSymbol;
    /** 子符号 */
    children: SymbolHierarchy[];
    /** 层级深度 */
    depth: number;
}

/** 符号访问信息 */
export interface SymbolAccessInfo {
    /** 最后访问时间 */
    lastAccess: number;
    /** 访问次数 */
    accessCount: number;
    /** 平均访问间隔 */
    averageInterval?: number;
}

/** 符号使用统计 */
export interface SymbolUsageStats {
    /** 定义次数 */
    definitions: number;
    /** 引用次数 */
    references: number;
    /** 最后使用时间 */
    lastUsed?: number;
    /** 使用频率 */
    frequency: number;
}

/** 符号关系图 */
export interface SymbolRelationGraph {
    /** 节点（符号） */
    nodes: Map<string, PureBasicSymbol>;
    /** 边（关系） */
    edges: Map<string, SymbolRelation[]>;
}

/** 符号关系 */
export interface SymbolRelation {
    /** 源符号ID */
    from: string;
    /** 目标符号ID */
    to: string;
    /** 关系类型 */
    type: SymbolRelationType;
    /** 强度（0-1） */
    strength: number;
}

/** 符号关系类型 */
export enum SymbolRelationType {
    /** 继承 */
    Inherits = 'inherits',
    /** 实现 */
    Implements = 'implements',
    /** 引用 */
    References = 'references',
    /** 包含 */
    Contains = 'contains',
    /** 调用 */
    Calls = 'calls',
    /** 实例化 */
    Instantiates = 'instantiates',
    /** 参数类型 */
    ParameterType = 'parameter-type',
    /** 返回类型 */
    ReturnType = 'return-type'
}