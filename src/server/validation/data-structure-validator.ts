/**
 * Data Structure Validator
 * Validate the syntax correctness of PureBasic data structures
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * Validate data structure related syntax
 */
export const validateDataStructures: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // Structure validation
    if (line.startsWith('Structure ')) {
        // Single-line Structure ... : EndStructure -> not pushed to stack
        const hasInlineEnd = /\bEndStructure\b/.test(line);
        if (hasInlineEnd) {
            // Only validate the syntax header, not pushed to stack
            const structMatch = line.match(/^Structure\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (!structMatch) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: lineNum, character: 0 },
                        end: { line: lineNum, character: originalLine.length }
                    },
                    message: 'Invalid Structure syntax. Expected: Structure Name',
                    source: 'purebasic'
                });
            }
        } else {
        const structMatch = line.match(/^Structure\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!structMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid Structure syntax. Expected: Structure Name',
                source: 'purebasic'
            });
        } else {
            context.structureStack.push({ name: structMatch[1], line: lineNum });
        }
    }
    } else if (/^EndStructure\b/.test(line)) {
        if (context.structureStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndStructure without matching Structure',
                source: 'purebasic'
            });
        } else {
            context.structureStack.pop();
        }
    }

    // Enumeration validation
    else if (line.startsWith('Enumeration')) {
        const enumMatch = line.match(/^Enumeration(?:\s+([a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+#([a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+Step\s+(\d+))?/);
        if (line.trim() !== 'Enumeration' && !enumMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid Enumeration syntax. Expected: Enumeration [Name] [#Start] [Step n]',
                source: 'purebasic'
            });
        }
    } else if (line === 'EndEnumeration') {
        // EndEnumeration doesn't need stack tracking because Enumeration can be nested
    }

    // Interface validation
    else if (line.startsWith('Interface ')) {
        const hasInlineEnd = /\bEndInterface\b/.test(line);
        const intfMatch = line.match(/^Interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!intfMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid Interface syntax. Expected: Interface Name',
                source: 'purebasic'
            });
        } else if (!hasInlineEnd) {
            context.interfaceStack.push(lineNum);
        }
    } else if (/^EndInterface\b/.test(line)) {
        if (context.interfaceStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndInterface without matching Interface',
                source: 'purebasic'
            });
        } else {
            context.interfaceStack.pop();
        }
    }
};
