/**
 * 数据结构验证器
 * 验证PureBasic数据结构的语法正确性
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidationContext, ValidatorFunction } from './types';

/**
 * 验证数据结构相关语法
 */
export const validateDataStructures: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context: ValidationContext,
    diagnostics
) => {
    // Structure 验证
    if (line.startsWith('Structure ')) {
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
    } else if (line === 'EndStructure') {
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

    // Enumeration 验证
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
        // EndEnumeration 不需要栈跟踪，因为Enumeration可以嵌套
    }

    // Interface 验证
    else if (line.startsWith('Interface ')) {
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
        } else {
            context.interfaceStack.push(lineNum);
        }
    } else if (line === 'EndInterface') {
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
