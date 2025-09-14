/**
 * 过程验证器
 * 验证PureBasic过程定义的语法正确性
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';
import { isValidType } from '../utils/constants';
import { validateParameters } from './parameter-validator';

/**
 * 验证过程相关语法
 */
export const validateProcedure: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    if (line.startsWith('Procedure') && line.length > 9 && !line.startsWith('ProcedureReturn')) {
        // 验证过程定义语法（先获取返回类型与过程名，不直接用正则捕获参数以避免嵌套括号问题）
        const headerMatch = line.match(/^Procedure\s*(?:\.(\w+))?\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!headerMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid Procedure syntax. Expected: Procedure[.Type] Name([parameters])',
                source: 'purebasic'
            });
        } else {
            const [, returnType, procName] = headerMatch;
            context.procedureStack.push({ name: procName, line: lineNum });

            // 验证返回类型
            if (returnType && !isValidType(returnType)) {
                const typeStart = line.indexOf('.' + returnType);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: lineNum, character: typeStart },
                        end: { line: lineNum, character: typeStart + returnType.length + 1 }
                    },
                    message: `Unknown return type: ${returnType}`,
                    source: 'purebasic'
                });
            }

            // 验证参数语法：支持参数中包含如 List/Array/Map 的 "()" 等嵌套括号
            const openIdx = line.indexOf('(');
            const closeIdx = line.lastIndexOf(')');
            if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
                const params = line.substring(openIdx + 1, closeIdx);
                if (params.trim().length > 0) {
                    validateParameters(params, lineNum, originalLine, diagnostics);
                }
            }
        }
    } else if (line === 'EndProcedure') {
        // 验证EndProcedure
        if (context.procedureStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndProcedure without matching Procedure',
                source: 'purebasic'
            });
        } else {
            context.procedureStack.pop();
        }
    } else if (line.startsWith('ProcedureReturn')) {
        // 验证ProcedureReturn
        if (context.procedureStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: 12 }
                },
                message: 'ProcedureReturn used outside of procedure',
                source: 'purebasic'
            });
        }
    }
};
