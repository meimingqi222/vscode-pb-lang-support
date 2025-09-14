/**
 * 变量验证器
 * 验证PureBasic变量声明的语法正确性
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidatorFunction } from './types';
import { isValidType } from '../utils/constants';
import { isInStringLiteral, isPositionInString } from '../utils/string-utils';

/**
 * 验证变量声明语法
 */
export const validateVariables: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context,
    diagnostics
) => {
    // 检查变量声明（带声明关键字）
    if (line.match(/^(Global|Protected|Static|Shared|Threaded)\s+/)) {
        validateVariableDeclaration(line, lineNum, originalLine, diagnostics);
    }

    // 检查一般变量声明（如 variable.type = value），但跳过字符串内容
    if (!isInStringLiteral(line)) {
        const varRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        let match;
        while ((match = varRegex.exec(line)) !== null) {
            const [fullMatch, varName, typePart] = match;
            const matchIndex = match.index;

            // 检查这个匹配是否在字符串内
            if (!isPositionInString(line, matchIndex)) {
                if (!isValidType(typePart)) {
                    const typeStart = matchIndex + varName.length + 1;
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: lineNum, character: typeStart },
                            end: { line: lineNum, character: typeStart + typePart.length }
                        },
                        message: `Unknown variable type: ${typePart}`,
                        source: 'purebasic'
                    });
                }
            }
        }
    }
};

// 使用 utils/string-utils 中的 isPositionInString，移除本地重复实现

function validateVariableDeclaration(line: string, lineNum: number, originalLine: string, diagnostics: any[]) {
    const varMatch = line.match(/^(?:Global|Protected|Static|Shared|Threaded)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/);
    if (varMatch) {
        const [, varDecl] = varMatch;
        const typePart = varDecl.split('.')[1];

        if (typePart && !isValidType(typePart)) {
            const typeStart = line.indexOf('.' + typePart);
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineNum, character: typeStart },
                    end: { line: lineNum, character: typeStart + typePart.length + 1 }
                },
                message: `Unknown variable type: ${typePart}`,
                source: 'purebasic'
            });
        }
    }
}
