/**
 * 字符串处理工具函数
 */

/**
 * 检查整行是否在字符串字面值内
 */
export function isInStringLiteral(line: string): boolean {
    let inString = false;
    let inStringChar = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (!inString) {
            if (char === '"' || char === "'") {
                inString = true;
                inStringChar = char;
            }
        } else {
            if (char === inStringChar) {
                // 检查是否是转义字符
                if (i === 0 || line[i - 1] !== '\\') {
                    inString = false;
                    inStringChar = '';
                }
            }
        }
    }

    return inString;
}

/**
 * 检查指定位置是否在字符串字面值内
 */
export function isPositionInString(line: string, position: number): boolean {
    let inString = false;
    let inStringChar = '';
    let i = 0;

    while (i < line.length && i < position) {
        const char = line[i];

        if (!inString) {
            if (char === '"' || char === "'") {
                inString = true;
                inStringChar = char;
            }
        } else {
            if (char === inStringChar) {
                // 检查是否是转义字符
                if (i === 0 || line[i - 1] !== '\\') {
                    inString = false;
                    inStringChar = '';
                }
            }
        }
        i++;
    }

    return inString;
}
