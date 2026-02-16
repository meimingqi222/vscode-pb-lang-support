/**
 * 符号相关类型定义
 */

export interface PureBasicSymbol {
    name: string;
    kind: SymbolKind;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    detail?: string;
    documentation?: string;
    module?: string; // 所属模块名称
    isPublic?: boolean; // 是否为公共符号
    parameters?: string[]; // 参数列表
    returnType?: string; // 返回类型
}

export enum SymbolKind {
    Procedure = 'procedure',
    Variable = 'variable',
    Constant = 'constant',
    Structure = 'structure',
    Module = 'module',
    Interface = 'interface',
    Enumeration = 'enumeration',
    Function = 'function',
    Keyword = 'keyword',
    Operator = 'operator',
    Parameter = 'parameter'
}
