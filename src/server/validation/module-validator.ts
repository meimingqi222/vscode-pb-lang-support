/**
 * 模块验证器
 * 验证PureBasic模块相关语法
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * 验证模块相关语法
 */
export const validateModules: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // Module 验证
    if (line.startsWith('Module ')) {
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
        } else {
            context.moduleStack.push({ name: moduleMatch[1], line: lineNum });
        }
    } else if (line === 'EndModule') {
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

    // DeclareModule 验证
    else if (line.startsWith('DeclareModule ')) {
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
        } else {
            context.declareModuleStack.push({ name: declModMatch[1], line: lineNum });
        }
    } else if (line === 'EndDeclareModule') {
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

    // UseModule 验证
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

    // UnuseModule 验证
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
