/**
 * Module Validator
 * Validate PureBasic module related syntax
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * Validate module related syntax
 */
export const validateModules: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // Module validation
    if (line.startsWith('Module ')) {
        // Single-line Module ... : EndModule -> not pushed to stack
        const hasInlineEnd = /\bEndModule\b/.test(line);
        const moduleMatch = line.match(/^Module\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!moduleMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid Module syntax. Expected: Module Name',
                source: 'purebasic'
            });
        } else if (!hasInlineEnd) {
            context.moduleStack.push({ name: moduleMatch[1], line: lineNum });
        }
    } else if (/^EndModule\b/.test(line)) {
        if (context.moduleStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndModule without matching Module',
                source: 'purebasic'
            });
        } else {
            context.moduleStack.pop();
        }
    }

    // DeclareModule validation
    else if (line.startsWith('DeclareModule ')) {
        const hasInlineEnd = /\bEndDeclareModule\b/.test(line);
        const declModMatch = line.match(/^DeclareModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!declModMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid DeclareModule syntax. Expected: DeclareModule Name',
                source: 'purebasic'
            });
        } else if (!hasInlineEnd) {
            context.declareModuleStack.push({ name: declModMatch[1], line: lineNum });
        }
    } else if (/^EndDeclareModule\b/.test(line)) {
        if (context.declareModuleStack.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'EndDeclareModule without matching DeclareModule',
                source: 'purebasic'
            });
        } else {
            context.declareModuleStack.pop();
        }
    }

    // UseModule validation
    else if (line.startsWith('UseModule ')) {
        const useModMatch = line.match(/^UseModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!useModMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid UseModule syntax. Expected: UseModule Name',
                source: 'purebasic'
            });
        }
    }

    // UnuseModule validation
    else if (line.startsWith('UnuseModule ')) {
        const unuseModMatch = line.match(/^UnuseModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (!unuseModMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid UnuseModule syntax. Expected: UnuseModule Name',
                source: 'purebasic'
            });
        }
    }
};
