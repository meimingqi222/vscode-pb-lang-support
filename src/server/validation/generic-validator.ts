/**
 * 通用验证器
 * 验证PureBasic的基本语法规则
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidatorFunction } from './types';
import { keywords, builtInFunctions, parsePureBasicConstantDefinition } from '../utils/constants';

/**
 * 验证通用语法规则
 */
export const validateGeneric: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context,
    diagnostics
) => {
    // 验证常量定义
    // 跳过模块访问的常量（如 Module::#Constant）
    if (line.startsWith('#') && !line.includes('::')) {
        const constMatch = parsePureBasicConstantDefinition(line);
        if (line.includes('=') && !constMatch) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Invalid constant definition syntax. Expected: #NAME = value',
                source: 'purebasic'
            });
        }
    }

    // 大幅简化通用语法验证，减少误报
    // 只检查非常明显的语法错误，让具体的验证器处理各自的语法

    // 跳过注释、空行和字符串字面值
    if (line.trim().startsWith(';') || line.trim() === '' || line.includes('"') || line.includes("'")) {
        return;
    }

    // 检查明显错误的模式：
    // 1. 以无效字符开头（但不是关键字、标识符、常量、或注释）
    const invalidStartPattern = /^\s*[^a-zA-Z_#;*\\@]/;

    // 只对真正无效的行报告错误
    if (invalidStartPattern.test(line)) {
        // 白名单：允许的特殊情况
        const isValidSpecialCase =
            line.includes('=') ||           // 赋值语句
            line.includes('(') ||           // 函数调用
            line.includes('[') ||           // 数组访问
            line.includes('.') ||           // 成员访问
            line.includes('\\') ||          // 文件路径
            line.startsWith('*') ||         // 指针变量（如结构体中的*Ptr）
            line.startsWith('@') ||         // 地址运算符
            keywords.some(kw => line.startsWith(kw)) ||  // 关键字开头
            builtInFunctions.some(fn => line.includes(fn)); // 内置函数

        if (!isValidSpecialCase) {
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: lineNum, character: 0 },
                    end: { line: lineNum, character: originalLine.length }
                },
                message: 'Potentially invalid statement syntax',
                source: 'purebasic'
            });
        }
    }
};
