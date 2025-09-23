/**
 * 未闭合结构验证器
 * 在文档验证结束时检查未闭合的结构
 */

import { DiagnosticSeverity, Diagnostic } from 'vscode-languageserver/node';
import { ValidationContext } from './types';

/**
 * 验证未闭合的结构
 * 暂时禁用，因为在复杂的PureBasic代码上产生太多误报
 */
export function validateUnclosedStructures(
    context: ValidationContext,
    lines: string[],
    diagnostics: Diagnostic[]
): void {
    const addDiag = (line: number, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Warning) => {
        const safeLine = Math.max(0, Math.min(line, Math.max(0, lines.length - 1)));
        const text = lines[safeLine] || '';
        diagnostics.push({
            severity,
            range: {
                start: { line: safeLine, character: 0 },
                end: { line: safeLine, character: text.length }
            },
            message,
            source: 'purebasic'
        });
    };

    // 程序块
    for (const proc of context.procedureStack) {
        addDiag(proc.line, `Unclosed Procedure '${proc.name}'. Missing EndProcedure.`);
    }

    // 模块
    for (const mod of context.moduleStack) {
        addDiag(mod.line, `Unclosed Module '${mod.name}'. Missing EndModule.`);
    }

    // DeclareModule
    for (const mod of context.declareModuleStack) {
        addDiag(mod.line, `Unclosed DeclareModule '${mod.name}'. Missing EndDeclareModule.`);
    }

    // 结构体
    for (const s of context.structureStack) {
        addDiag(s.line, `Unclosed Structure '${s.name}'. Missing EndStructure.`);
    }

    // Interface
    for (const line of context.interfaceStack) {
        addDiag(line, 'Unclosed Interface. Missing EndInterface.');
    }

    // 控制结构
    for (const line of context.ifStack) {
        addDiag(line, 'Unclosed If. Missing EndIf.');
    }
    for (const line of context.forStack) {
        addDiag(line, 'Unclosed For/ForEach. Missing Next.');
    }
    for (const line of context.whileStack) {
        addDiag(line, 'Unclosed While. Missing Wend.');
    }
    for (const line of context.repeatStack) {
        addDiag(line, 'Unclosed Repeat. Missing Until/ForEver.');
    }
    for (const line of context.selectStack) {
        addDiag(line, 'Unclosed Select. Missing EndSelect.');
    }
    for (const line of context.withStack) {
        addDiag(line, 'Unclosed With. Missing EndWith.');
    }
}
