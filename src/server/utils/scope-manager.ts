/**
 * 作用域管理器
 * 处理PureBasic变量和符号的作用域分析
 */

export enum ScopeType {
    Global = 'global',
    Procedure = 'procedure',
    Module = 'module',
    Structure = 'structure',
    If = 'if',
    For = 'for',
    While = 'while',
    Repeat = 'repeat',
    Select = 'select'
}

export interface ScopeInfo {
    type: ScopeType;
    name?: string;
    startLine: number;
    endLine?: number;
    parentScope?: ScopeInfo;
}

export interface VariableInfo {
    name: string;
    type: string;
    scope: ScopeInfo;
    definitionLine: number;
    isGlobal: boolean;
    isProtected: boolean;
    isStatic: boolean;
    isParameter: boolean;
}

/**
 * 解析文档中的作用域和变量
 */
export function analyzeScopesAndVariables(text: string, currentLine: number): {
    currentScope: ScopeInfo;
    availableVariables: VariableInfo[];
    allScopes: ScopeInfo[];
} {
    const lines = text.split(/\r?\n/);
    const scopes: ScopeInfo[] = [];
    const variables: VariableInfo[] = [];
    const scopeStack: ScopeInfo[] = [];

    // 全局作用域
    const globalScope: ScopeInfo = {
        type: ScopeType.Global,
        startLine: 0,
        endLine: lines.length - 1
    };
    scopes.push(globalScope);
    scopeStack.push(globalScope);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const originalLine = lines[i];

        // 跳过注释行
        if (line.startsWith(';')) {
            continue;
        }

        // 检查作用域开始
        const scopeStart = detectScopeStart(line, i);
        if (scopeStart) {
            scopeStart.parentScope = scopeStack[scopeStack.length - 1];
            scopes.push(scopeStart);
            scopeStack.push(scopeStart);
        }

        // 检查作用域结束
        if (detectScopeEnd(line, scopeStack)) {
            const endedScope = scopeStack.pop();
            if (endedScope) {
                endedScope.endLine = i;
            }
        }

        // 解析变量定义
        const currentScope = scopeStack[scopeStack.length - 1];
        if (!currentScope) continue; // 安全检查

        const variablesInLine = parseVariablesInLine(line, i, currentScope);
        variables.push(...variablesInLine);

        // 如果是过程定义，解析参数
        const procMatch = line.match(/^Procedure(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
        if (procMatch && currentScope.type === ScopeType.Procedure) {
            const params = procMatch[3] || '';
            const paramVariables = parseParameters(params, i, currentScope);
            variables.push(...paramVariables);
        }
    }

    // 找到当前行所在的作用域
    const currentScope = findScopeAtLine(scopes, currentLine);

    // 获取在当前作用域中可见的变量
    const availableVariables = getAvailableVariables(variables, currentScope, currentLine);

    return {
        currentScope,
        availableVariables,
        allScopes: scopes
    };
}

/**
 * 检测作用域开始
 */
function detectScopeStart(line: string, lineNumber: number): ScopeInfo | null {
    // Procedure 开始
    const procMatch = line.match(/^Procedure(?:\.(\w+))?\s+(\w+)/i);
    if (procMatch) {
        return {
            type: ScopeType.Procedure,
            name: procMatch[2],
            startLine: lineNumber
        };
    }

    // Module 开始
    const moduleMatch = line.match(/^Module\s+(\w+)/i);
    if (moduleMatch) {
        return {
            type: ScopeType.Module,
            name: moduleMatch[1],
            startLine: lineNumber
        };
    }

    // Structure 开始
    const structMatch = line.match(/^Structure\s+(\w+)/i);
    if (structMatch) {
        return {
            type: ScopeType.Structure,
            name: structMatch[1],
            startLine: lineNumber
        };
    }

    // If 开始
    if (line.match(/^If\b/i)) {
        return {
            type: ScopeType.If,
            startLine: lineNumber
        };
    }

    // For 开始
    const forMatch = line.match(/^For\s+/i);
    if (forMatch) {
        return {
            type: ScopeType.For,
            startLine: lineNumber
        };
    }

    // While 开始
    if (line.match(/^While\b/i)) {
        return {
            type: ScopeType.While,
            startLine: lineNumber
        };
    }

    // Repeat 开始
    if (line.match(/^Repeat\b/i)) {
        return {
            type: ScopeType.Repeat,
            startLine: lineNumber
        };
    }

    // Select 开始
    if (line.match(/^Select\b/i)) {
        return {
            type: ScopeType.Select,
            startLine: lineNumber
        };
    }

    return null;
}

/**
 * 检测作用域结束
 */
function detectScopeEnd(line: string, scopeStack: ScopeInfo[]): boolean {
    const currentScope = scopeStack[scopeStack.length - 1];
    if (!currentScope) return false;

    switch (currentScope.type) {
        case ScopeType.Procedure:
            return line.match(/^EndProcedure\b/i) !== null;
        case ScopeType.Module:
            return line.match(/^EndModule\b/i) !== null;
        case ScopeType.Structure:
            return line.match(/^EndStructure\b/i) !== null;
        case ScopeType.If:
            return line.match(/^EndIf\b/i) !== null;
        case ScopeType.For:
            return line.match(/^Next\b/i) !== null;
        case ScopeType.While:
            return line.match(/^Wend\b/i) !== null;
        case ScopeType.Repeat:
            return line.match(/^Until\b/i) !== null;
        case ScopeType.Select:
            return line.match(/^EndSelect\b/i) !== null;
        default:
            return false;
    }
}

/**
 * 解析一行中的变量定义
 */
function parseVariablesInLine(line: string, lineNumber: number, currentScope: ScopeInfo): VariableInfo[] {
    const variables: VariableInfo[] = [];

    // 匹配变量定义模式
    const patterns = [
        // Global, Protected, Static, Define, Shared, Threaded 变量
        /^(Global|Protected|Static|Define|Shared|Threaded)\s+(\*?)(\w+)(?:\.(\w+))?(?:\(([^)]*)\))?/i,
        // Dim 数组
        /^Dim\s+(\w+)(?:\.(\w+))?(?:\(([^)]*)\))?/i,
        // NewList 声明
        /^(Global|Protected|Static|Define)?\s*NewList\s+(\w+)(?:\.(\w+))?/i,
        // NewMap 声明
        /^(Global|Protected|Static|Define)?\s*NewMap\s+(\w+)(?:\.(\w+))?/i,
        // 局部变量（在过程内的简单变量声明）
        /^(\w+)(?:\.(\w+))?\s*=/i
    ];

    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
            let variableName: string;
            let variableType: string = 'unknown';
            let isGlobal = false;
            let isProtected = false;
            let isStatic = false;

            if (pattern === patterns[0]) { // Global/Protected/Static等
                const modifier = match[1];
                const isPointer = match[2] === '*';
                variableName = match[3];
                variableType = match[4] || 'i';
                const arraySize = match[5];

                isGlobal = modifier?.toLowerCase() === 'global';
                isProtected = modifier?.toLowerCase() === 'protected';
                isStatic = modifier?.toLowerCase() === 'static';

                if (arraySize) {
                    variableType = `${variableType}[] (array)`;
                } else if (isPointer) {
                    variableType = `*${variableType} (pointer)`;
                }
            } else if (pattern === patterns[1]) { // Dim
                variableName = match[1];
                variableType = match[2] || 'i';
                const arraySize = match[3];
                if (arraySize) {
                    variableType = `${variableType}[] (array)`;
                }
            } else if (pattern === patterns[2]) { // NewList
                const modifier = match[1];
                variableName = match[2];
                variableType = `${match[3] || 'unknown'} (list)`;
                isGlobal = modifier?.toLowerCase() === 'global';
                isProtected = modifier?.toLowerCase() === 'protected';
                isStatic = modifier?.toLowerCase() === 'static';
            } else if (pattern === patterns[3]) { // NewMap
                const modifier = match[1];
                variableName = match[2];
                variableType = `${match[3] || 'unknown'} (map)`;
                isGlobal = modifier?.toLowerCase() === 'global';
                isProtected = modifier?.toLowerCase() === 'protected';
                isStatic = modifier?.toLowerCase() === 'static';
            } else if (pattern === patterns[4]) { // 局部变量赋值
                variableName = match[1];
                variableType = match[2] || 'i';
                // 只有在过程作用域内才考虑局部变量
                if (currentScope.type !== ScopeType.Procedure) {
                    continue;
                }
            } else {
                continue;
            }

            variables.push({
                name: variableName,
                type: variableType,
                scope: currentScope,
                definitionLine: lineNumber,
                isGlobal,
                isProtected,
                isStatic,
                isParameter: false
            });
        }
    }

    return variables;
}

/**
 * 解析过程参数
 */
function parseParameters(paramString: string, lineNumber: number, currentScope: ScopeInfo): VariableInfo[] {
    const parameters: VariableInfo[] = [];

    if (!paramString.trim()) {
        return parameters;
    }

    const params = paramString.split(',');
    for (const param of params) {
        const trimmedParam = param.trim();
        const paramMatch = trimmedParam.match(/^(\*?)(\w+)(?:\.(\w+))?/);

        if (paramMatch) {
            const isPointer = paramMatch[1] === '*';
            const paramName = paramMatch[2];
            const paramType = paramMatch[3] || 'unknown';

            let finalType = paramType;
            if (isPointer) {
                finalType = `*${paramType} (pointer)`;
            }

            parameters.push({
                name: paramName,
                type: finalType,
                scope: currentScope,
                definitionLine: lineNumber,
                isGlobal: false,
                isProtected: false,
                isStatic: false,
                isParameter: true
            });
        }
    }

    return parameters;
}

/**
 * 找到指定行所在的作用域
 */
function findScopeAtLine(scopes: ScopeInfo[], lineNumber: number): ScopeInfo {
    let currentScope = scopes[0]; // 默认全局作用域

    for (const scope of scopes) {
        if (scope.startLine <= lineNumber &&
            (scope.endLine === undefined || scope.endLine >= lineNumber)) {
            // 选择最具体的作用域（嵌套最深的）
            if (scope.startLine >= currentScope.startLine) {
                currentScope = scope;
            }
        }
    }

    return currentScope;
}

/**
 * 获取在当前作用域中可见的变量
 */
function getAvailableVariables(allVariables: VariableInfo[], currentScope: ScopeInfo, currentLine: number): VariableInfo[] {
    const availableVariables: VariableInfo[] = [];

    for (const variable of allVariables) {
        // 变量必须在当前行之前定义
        if (variable.definitionLine >= currentLine) {
            continue;
        }

        // 全局变量总是可见
        if (variable.isGlobal) {
            availableVariables.push(variable);
            continue;
        }

        // 检查变量是否在当前作用域或父作用域中可见
        if (isVariableVisibleInScope(variable, currentScope)) {
            availableVariables.push(variable);
        }
    }

    return availableVariables;
}

/**
 * 检查变量是否在指定作用域中可见
 */
function isVariableVisibleInScope(variable: VariableInfo, targetScope: ScopeInfo): boolean {
    // 全局变量总是可见
    if (variable.isGlobal) {
        return true;
    }

    // Protected 变量在模块内可见
    if (variable.isProtected && variable.scope.type === ScopeType.Module) {
        // 检查目标作用域是否在同一个模块内
        let checkScope: ScopeInfo | undefined = targetScope;
        while (checkScope) {
            if (checkScope.type === ScopeType.Module &&
                checkScope.name === variable.scope.name) {
                return true;
            }
            checkScope = checkScope.parentScope;
        }
        return false;
    }

    // Static 变量在声明的过程内可见
    if (variable.isStatic && variable.scope.type === ScopeType.Procedure) {
        // 检查目标作用域是否是同一个过程或其子作用域
        let checkScope: ScopeInfo | undefined = targetScope;
        while (checkScope) {
            if (checkScope.type === ScopeType.Procedure &&
                checkScope.name === variable.scope.name) {
                return true;
            }
            checkScope = checkScope.parentScope;
        }
        return false;
    }

    // 普通局部变量只在声明的作用域或其子作用域中可见
    let checkScope: ScopeInfo | undefined = targetScope;
    while (checkScope) {
        if (checkScope === variable.scope) {
            return true;
        }
        checkScope = checkScope.parentScope;
    }

    return false;
}

/**
 * 扫描至当前行，返回当前有效的 UseModule 模块列表
 * - UseModule X 使 X 的导出在后续代码中可见，直到被 UnuseModule X 取消或文件结束
 * - 简化处理：不考虑条件编译与宏，仅按行顺序处理 UseModule/UnuseModule
 */
export function getActiveUsedModules(text: string, currentLine: number): string[] {
    const lines = text.split(/\r?\n/);
    const used = new Set<string>();

    const max = Math.min(currentLine, lines.length - 1);
    for (let i = 0; i <= max; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith(';') || trimmed === '') continue;

        const useMatch = trimmed.match(/^UseModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
        if (useMatch) {
            used.add(useMatch[1]);
            continue;
        }

        const unuseMatch = trimmed.match(/^UnuseModule\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
        if (unuseMatch) {
            used.delete(unuseMatch[1]);
            continue;
        }
    }

    return Array.from(used);
}
