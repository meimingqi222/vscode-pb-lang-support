/**
 * Control Structure Validator
 * Verifies the matching of PureBasic control structures
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * Verify matching of control structures (If-EndIf, For-Next, While-Wend, Repeat-Until/ForEver, Select-EndSelect, With-EndWith).
 */
export const validateControlStructures: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // If-EndIf Structure - Supports single-line If: ... : EndIf (allows arbitrary whitespace/comments)
    if (/^If\b/.test(line) && !/^IfElse\b/.test(line)) {
        const hasInlineEnd = /\bEndIf\b/.test(line);
        if (!hasInlineEnd) {
            context.ifStack.push(lineNum);
        }
    } else if (/^EndIf\b/.test(line)) {
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
        // 单行 For ... : Next
        const hasInlineEnd = /\bNext\b/.test(line);
        if (!hasInlineEnd) {
            context.forStack.push(lineNum);
        }
    } else if (/^Next\b/.test(line)) {
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
        // 单行 While ... : Wend
        const hasInlineEnd = /\bWend\b/.test(line);
        if (!hasInlineEnd) {
            context.whileStack.push(lineNum);
        }
    } else if (/^Wend\b/.test(line)) {
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

    // Repeat-Until / Repeat-ForEver 结构
    else if (/^Repeat\b/.test(line)) {
        // 支持单行多语句：Repeat : ... : Until/ForEver
        // 若同一行内包含闭合关键字，则不入栈（净零效果）
        const hasInlineClose = /\bForEver\b/.test(line) || /\bUntil\b/.test(line);
        if (!hasInlineClose) {
            context.repeatStack.push(lineNum);
        }
    } else if (line.startsWith('ForEver')) {
        // ForEver 作为 Repeat 的闭合
        if (context.repeatStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'ForEver without matching Repeat',
                source: 'purebasic'
            });
        } else {
            context.repeatStack.pop();
        }
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
        // 单行 Select ... : EndSelect（极少见，仍兼容）
        const hasInlineEnd = /\bEndSelect\b/.test(line);
        if (!hasInlineEnd) {
            context.selectStack.push(lineNum);
        }
    } else if (/^EndSelect\b/.test(line)) {
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
        // 单行 With ... : EndWith（兼容）
        const hasInlineEnd = /\bEndWith\b/.test(line);
        if (!hasInlineEnd) {
            context.withStack.push(lineNum);
        }
    } else if (/^EndWith\b/.test(line)) {
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
