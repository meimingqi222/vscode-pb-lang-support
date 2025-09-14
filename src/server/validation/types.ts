/**
 * 验证相关类型定义
 */

import { Diagnostic } from 'vscode-languageserver/node';

export interface NamedBlock {
    name: string;
    line: number;
}

export interface ValidationContext {
    procedureStack: NamedBlock[];
    structureStack: NamedBlock[];
    ifStack: number[];
    forStack: number[];
    whileStack: number[];
    repeatStack: number[];
    selectStack: number[];
    withStack: number[];
    moduleStack: NamedBlock[];
    declareModuleStack: NamedBlock[];
    interfaceStack: number[];
}

export type ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics: Diagnostic[]
) => void;
