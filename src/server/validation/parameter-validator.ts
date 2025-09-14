/**
 * 参数验证器
 * 验证PureBasic过程参数的语法正确性
 */

import { DiagnosticSeverity, Diagnostic } from 'vscode-languageserver/node';

/**
 * 验证参数语法
 * 支持多种PureBasic参数语法格式
 */
export function validateParameters(
    params: string,
    lineNum: number,
    originalLine: string,
    diagnostics: Diagnostic[]
): void {
    // 按逗号分隔参数，但忽略括号与引号中的逗号
    const paramList: string[] = [];
    let buf = '';
    let paren = 0;
    let inString = false;
    for (let i = 0; i < params.length; i++) {
        const ch = params[i];
        if (ch === '"') {
            inString = !inString;
            buf += ch;
            continue;
        }
        if (!inString) {
            if (ch === '(') paren++;
            if (ch === ')') paren = Math.max(0, paren - 1);
            if (ch === ',' && paren === 0) {
                if (buf.trim()) paramList.push(buf.trim());
                buf = '';
                continue;
            }
        }
        buf += ch;
    }
    if (buf.trim()) paramList.push(buf.trim());

    for (const param of paramList) {
        // 跳过空参数和注释
        if (param.trim() === '' || param.trim().startsWith(';')) {
            continue;
        }

        // 使用宽松的验证策略 - 只检查明显的错误语法
        let isValid = true;

        // 基本的PureBasic参数模式检查
        // 有效的参数应该以字母、下划线、星号或List/Array/Map关键字开头
        if (!/^(?:[a-zA-Z_]|List\s|Array\s|Map\s|\*)/.test(param)) {
            isValid = false;
        }

        // 检查是否有明显的语法错误
        // 1. 连续的点号
        if (/\.\./.test(param)) {
            isValid = false;
        }

        // 2. 括号校验：
        //    - List/Map 需要空括号 ()
        //    - Array 允许括号中包含维度，如 (10) 或 (10,20)
        if (/^List\s+/i.test(param) || /^Map\s+/i.test(param)) {
            if (!/\(\s*\)/.test(param)) {
                isValid = false;
            }
        } else if (/^Array\s+/i.test(param)) {
            if (!(param.includes('(') && param.includes(')'))) {
                isValid = false;
            }
        }

        // 3. 其他明显错误的字符模式（对默认值部分放宽：允许 - + $ # % @ & ）
        if (/[^a-zA-Z0-9_\s\.\*:=\(\),;"'\-\+\$#%@&]/.test(param)) {
            isValid = false;
        }

        if (!isValid) {
            const paramStart = originalLine.indexOf(param);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNum, character: paramStart },
                    end: { line: lineNum, character: paramStart + param.length }
                },
                message: 'Invalid parameter syntax. Expected: [*|List|Array|Map ]name[.module::type][()][=default]',
                source: 'purebasic'
            });
        }
    }
}
