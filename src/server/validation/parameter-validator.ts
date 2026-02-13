/**
 * Parameter Validator
 * Validate the syntax correctness of PureBasic procedure parameters
 */

import { DiagnosticSeverity, Diagnostic } from 'vscode-languageserver/node';

/**
 * Validate parameter syntax
 * Support multiple PureBasic parameter syntax formats
 */
export function validateParameters(
    params: string,
    lineNum: number,
    originalLine: string,
    diagnostics: Diagnostic[]
): void {
    // Ignore parameters that are part of a comment (e.g. "Procedure X();(alternative / old commented-out parameters)")
    // If ';' occurs before the first '(' in the original line, everything after ';' is a comment in PureBasic.
    const commentIdx = originalLine.indexOf(';');
    const parenIdx = originalLine.indexOf('(');
    if (commentIdx !== -1 && parenIdx !== -1 && commentIdx < parenIdx) {
        return;
    }

    // Split parameters by comma, but ignore commas in parentheses and quotes
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
        // Skip empty parameters and comments
        if (param.trim() === '' || param.trim().startsWith(';')) {
            continue;
        }
        // Use relaxed validation strategy - only check obvious syntax errors
        let isValid = true;
        // Basic PureBasic parameter pattern check
        // Valid parameters should start with letters, underscores, asterisks, or List/Array/Map keywords
        if (!/^(?:[a-zA-Z_]|List\s|Array\s|Map\s|\*)/.test(param)) {
            isValid = false;
        }
        // Check for obvious syntax errors
        // 1. Consecutive dots
        if (/\.\./.test(param)) {
            isValid = false;
        }
        // 2. Parenthesis validation:
        //    - List/Map require empty parentheses ()
        //    - Array allows dimensions in parentheses, e.g., (10) or (10,20)
        if (/^List\s+/i.test(param) || /^Map\s+/i.test(param)) {
            if (!/\(\s*\)/.test(param)) {
                isValid = false;
            }
        } else if (/^Array\s+/i.test(param)) {
            if (!(param.includes('(') && param.includes(')'))) {
                isValid = false;
            }
        }
        // 3. Other obvious erroneous character patterns (relaxed for default values: allows - + $ # % @ & )
        if (/[^a-zA-Z0-9_\s\.\*:=\(\),;"'\-\+\$#%@&]/.test(param)) {
            isValid = false;
        }

        if (!isValid) {
            let paramStart = originalLine.indexOf(param);
            if (paramStart < 0) paramStart = 0;
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
