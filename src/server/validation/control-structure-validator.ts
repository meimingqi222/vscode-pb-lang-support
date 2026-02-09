/**
 * Control Structure Validator
 * Verifies the matching of PureBasic control structures
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

// Helper function to split a line into statements at ':' while respecting string literals and comments.
const splitStatements = (srcLine: string): string[] => {
    // Split at ':' but only outside of string literals.
    // PureBasic escapes quotes inside strings with "" (double quote).
    const parts: string[] = [];
    let cur = '';
    let inStr = false;

    for (let i = 0; i < srcLine.length; i++) {
        const ch = srcLine[i];

        if (ch === '"') {
            if (inStr && srcLine[i + 1] === '"') {
                cur += '""';
                i++;
                continue;
            }
            inStr = !inStr;
            cur += ch;
            continue;
        }

        // If your pipeline already stripped comments, this is harmless.
        // Otherwise it prevents splitting inside comments.
        if (!inStr && ch === ';') {
            break;
        }

        if (!inStr && ch === ':') {
            const trimmed = cur.trim();
            if (trimmed.length > 0) parts.push(trimmed);
            cur = '';
            continue;
        }

        cur += ch;
    }

    const trimmed = cur.trim();
    if (trimmed.length > 0) parts.push(trimmed);

    return parts;
};

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

    const validateStatement = (stmt: string) => {
        const s = stmt.trimStart();
        // If-EndIf Structure - Supports single-line If: ... : EndIf (allows arbitrary whitespace/comments)
        if (/^If\b/.test(s) && !/^IfElse\b/.test(s)) {
            const hasInlineEnd = /\bEndIf\b/.test(s);
            if (!hasInlineEnd) {
                context.ifStack.push(lineNum);
            }
        } else if (/^EndIf\b/.test(s)) {
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

        //For-Next Structure (including ForEach)
        else if (s.startsWith('For ') || s.startsWith('ForEach ')) {
            // Single-line For...: Next
            const hasInlineEnd = /\bNext\b/.test(s);
            if (!hasInlineEnd) {
                context.forStack.push(lineNum);
            }
        } else if (/^Next\b/.test(s)) {
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

        // While-Wend Structure
        else if (s.startsWith('While ')) {
            // Single-line While ... : Wend
            const hasInlineEnd = /\bWend\b/.test(s);
            if (!hasInlineEnd) {
                context.whileStack.push(lineNum);
            }
        } else if (/^Wend\b/.test(s)) {
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

        // Repeat-Until / Repeat-Forever Structures
        else if (/^Repeat\b/.test(s)) {
            // Supports multiple statements per line: Repeat : ... : Until/ForEver
            // If a closing keyword appears on the same line, it is not pushed onto the stack (net zero effect)
            const hasInlineClose = /\bForEver\b/.test(s) || /\bUntil\b/.test(s);
            if (!hasInlineClose) {
                context.repeatStack.push(lineNum);
            }
        } else if (s.startsWith('ForEver')) {
            // ForEver as a closure of Repeat
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
        } else if (s.startsWith('Until')) { // 'Until condition' 或 'Until'
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

        // Select-EndSelect structure
        else if (s.startsWith('Select ')) {
            // Single-line Select ... : EndSelect (extremely rare, still compatible)
            const hasInlineEnd = /\bEndSelect\b/.test(s);
            if (!hasInlineEnd) {
                context.selectStack.push(lineNum);
            }
        } else if (/^EndSelect\b/.test(s)) {
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

        // With-EndWith structure
        else if (s.startsWith('With ')) {
            //Single-line With ... : EndWith (Compatibility)
            const hasInlineEnd = /\bEndWith\b/.test(s);
            if (!hasInlineEnd) {
                context.withStack.push(lineNum);
            }
        } else if (/^EndWith\b/.test(s)) {
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

    // Line split into ":" statements and validated individually.
    for (const stmt of splitStatements(originalLine)) {
        validateStatement(stmt);
    }
};