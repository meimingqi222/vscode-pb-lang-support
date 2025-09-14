/**
 * 控制结构验证器
 * 验证PureBasic控制结构的匹配性
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * 验证控制结构的匹配
 */
export const validateControlStructures: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // If-EndIf 结构 - 支持单行If语句格式：If condition : statement : EndIf
    if (line.startsWith('If ') && !line.startsWith('IfElse')) {
        // 检查是否为单行If语句 (If condition : statement : EndIf)
        const colonCount = (line.match(/:/g) || []).length;
        const hasEndIfInSameLine = line.includes(': EndIf') || line.endsWith('EndIf');

        // 如果是单行If语句，不需要加入栈
        if (!(colonCount >= 2 && hasEndIfInSameLine)) {
            context.ifStack.push(lineNum);
        }
    } else if (line === 'EndIf') {
        if (context.ifStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndIf without matching If',
                source: 'purebasic'
            });
        } else {
            context.ifStack.pop();
        }
    }

    // For-Next 结构（包括ForEach）
    else if (line.startsWith('For ') || line.startsWith('ForEach ')) {
        context.forStack.push(lineNum);
    } else if (line === 'Next' || line.startsWith('Next ')) {
        if (context.forStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Next without matching For/ForEach',
                source: 'purebasic'
            });
        } else {
            context.forStack.pop();
        }
    }

    // While-Wend 结构
    else if (line.startsWith('While ')) {
        context.whileStack.push(lineNum);
    } else if (line === 'Wend') {
        if (context.whileStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Wend without matching While',
                source: 'purebasic'
            });
        } else {
            context.whileStack.pop();
        }
    }

    // Repeat-Until 结构
    else if (line === 'Repeat') {
        context.repeatStack.push(lineNum);
    } else if (line.startsWith('Until')) { // 'Until condition' 或 'Until'
        if (context.repeatStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Until without matching Repeat',
                source: 'purebasic'
            });
        } else {
            context.repeatStack.pop();
        }
    }

    // Select-EndSelect 结构
    else if (line.startsWith('Select ')) {
        context.selectStack.push(lineNum);
    } else if (line === 'EndSelect') {
        if (context.selectStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndSelect without matching Select',
                source: 'purebasic'
            });
        } else {
            context.selectStack.pop();
        }
    }

    // With-EndWith 结构
    else if (line.startsWith('With ')) {
        context.withStack.push(lineNum);
    } else if (line === 'EndWith') {
        if (context.withStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndWith without matching With',
                source: 'purebasic'
            });
        } else {
            context.withStack.pop();
        }
    }
};
