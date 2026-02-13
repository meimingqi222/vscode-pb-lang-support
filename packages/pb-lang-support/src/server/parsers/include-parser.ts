/**
 * PureBasic Include File Parser
 * 解析XIncludeFile指令和包含文件
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export interface IncludeFile {
    filePath: string;
    resolvedPath: string;
    lineNumber: number;
    isConditional: boolean;
}

export interface IncludeAnalysis {
    includeFiles: IncludeFile[];
    dependencies: Map<string, string[]>;
    circularDependencies: string[];
    missingFiles: string[];
}

/**
 * 解析文档中的XIncludeFile指令
 */
export function parseIncludeFiles(document: TextDocument, baseDirectory: string = ''): IncludeAnalysis {
    const content = document.getText();
    const lines = content.split('\n');

    const includeFiles: IncludeFile[] = [];
    const dependencies = new Map<string, string[]>();
    const circularDependencies: string[] = [];
    const missingFiles: string[] = [];

    const currentFile = URI.parse(document.uri).fsPath;
    dependencies.set(currentFile, []);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 解析XIncludeFile指令
        const includeMatch = line.match(/XIncludeFile\s+["']([^"']+)["']/);
        if (includeMatch) {
            const includePath = includeMatch[1];
            const resolvedPath = resolveIncludePath(includePath, baseDirectory);

            const includeFile: IncludeFile = {
                filePath: includePath,
                resolvedPath,
                lineNumber: i,
                isConditional: isConditionalInclude(line)
            };

            includeFiles.push(includeFile);
            dependencies.get(currentFile)!.push(resolvedPath);
        }

        // 解析Include指令（兼容旧语法）
        const oldIncludeMatch = line.match(/IncludeFile\s+["']([^"']+)["']/);
        if (oldIncludeMatch) {
            const includePath = oldIncludeMatch[1];
            const resolvedPath = resolveIncludePath(includePath, baseDirectory);

            const includeFile: IncludeFile = {
                filePath: includePath,
                resolvedPath,
                lineNumber: i,
                isConditional: isConditionalInclude(line)
            };

            includeFiles.push(includeFile);
            dependencies.get(currentFile)!.push(resolvedPath);
        }

        // 解析条件包含
        const conditionalMatch = line.match(/If\s+\w+\s*:\s*XIncludeFile\s+["']([^"']+)["']/);
        if (conditionalMatch) {
            const includePath = conditionalMatch[1];
            const resolvedPath = resolveIncludePath(includePath, baseDirectory);

            const includeFile: IncludeFile = {
                filePath: includePath,
                resolvedPath,
                lineNumber: i,
                isConditional: true
            };

            includeFiles.push(includeFile);
            dependencies.get(currentFile)!.push(resolvedPath);
        }
    }

    // 检测循环依赖
    detectCircularDependencies(dependencies, circularDependencies);

    return {
        includeFiles,
        dependencies,
        circularDependencies,
        missingFiles
    };
}

/**
 * 解析包含文件的内容并提取符号
 */
export function parseIncludedSymbols(document: TextDocument): Map<string, any> {
    const symbols = new Map<string, any>();
    const content = document.getText();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 解析过程定义
        if (line.startsWith('Procedure') || line.startsWith('Procedure.')) {
            const procMatch = line.match(/(?:Procedure|Procedure\.\w+)\s+(\w+)\s*\(/);
            if (procMatch) {
                const procName = procMatch[1];
                symbols.set(procName, {
                    type: 'procedure',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: isExportedSymbol(line)
                });
            }
        }

        // 解析变量声明（在包含文件中通常是全局的）
        if (line.startsWith('Global') || line.startsWith('Define')) {
            const varMatch = line.match(/(?:Global|Define)\s+(\w+)/);
            if (varMatch) {
                const varName = varMatch[1];
                symbols.set(varName, {
                    type: 'variable',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });
            }
        }

        // Parsing constant definitions
        if (line.startsWith('#')) {
            const constMatch = line.match(/#\s*([a-zA-Z_][a-zA-Z0-9_]*\$?)\s*=/);
            if (constMatch) {
                const constName = constMatch[1];
                symbols.set(constName, {
                    type: 'constant',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });
            }
        }

        // 解析结构定义
        if (line.startsWith('Structure')) {
            const structMatch = line.match(/Structure\s+(\w+)/);
            if (structMatch) {
                const structName = structMatch[1];
                symbols.set(structName, {
                    type: 'structure',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });

                // 解析结构成员
                const members = parseStructureMembers(lines, i + 1);
                for (const member of members) {
                    const memberKey = `${structName}.${member.name}`;
                    symbols.set(memberKey, {
                        type: 'structure-member',
                        file: document.uri,
                        line: member.line,
                        definition: member.definition,
                        exported: true,
                        parent: structName
                    });
                }
            }
        }

        // 解析接口定义
        if (line.startsWith('Interface')) {
            const interfaceMatch = line.match(/Interface\s+(\w+)/);
            if (interfaceMatch) {
                const interfaceName = interfaceMatch[1];
                symbols.set(interfaceName, {
                    type: 'interface',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });

                // 解析接口方法
                const methods = parseInterfaceMethods(lines, i + 1);
                for (const method of methods) {
                    const methodKey = `${interfaceName}::${method.name}`;
                    symbols.set(methodKey, {
                        type: 'interface-method',
                        file: document.uri,
                        line: method.line,
                        definition: method.definition,
                        exported: true,
                        parent: interfaceName
                    });
                }
            }
        }

        // 解析枚举定义
        if (line.startsWith('Enumeration')) {
            const enumMatch = line.match(/Enumeration\s+(\w+)/);
            if (enumMatch) {
                const enumName = enumMatch[1];
                symbols.set(enumName, {
                    type: 'enumeration',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });

                // 解析枚举值
                const values = parseEnumerationValues(lines, i + 1);
                for (const value of values) {
                    const valueKey = `${enumName}.${value.name}`;
                    symbols.set(valueKey, {
                        type: 'enumeration-value',
                        file: document.uri,
                        line: value.line,
                        definition: value.definition,
                        exported: true,
                        parent: enumName
                    });
                }
            }
        }

        // 解析宏定义
        if (line.startsWith('Macro')) {
            const macroMatch = line.match(/Macro\s+(\w+)\s*\(/);
            if (macroMatch) {
                const macroName = macroMatch[1];
                symbols.set(macroName, {
                    type: 'macro',
                    file: document.uri,
                    line: i,
                    definition: line,
                    exported: true
                });
            }
        }
    }

    return symbols;
}

/**
 * 解析结构成员
 */
function parseStructureMembers(lines: string[], startLine: number): Array<{name: string, line: number, definition: string}> {
    const members: Array<{name: string, line: number, definition: string}> = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'EndStructure') {
            break;
        }

        // 解析成员定义
        const memberMatch = line.match(/(\w+)\s*[.:].+/);
        if (memberMatch) {
            members.push({
                name: memberMatch[1],
                line: i,
                definition: line
            });
        }
    }

    return members;
}

/**
 * 解析接口方法
 */
function parseInterfaceMethods(lines: string[], startLine: number): Array<{name: string, line: number, definition: string}> {
    const methods: Array<{name: string, line: number, definition: string}> = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'EndInterface') {
            break;
        }

        // 解析方法定义
        const methodMatch = line.match(/(\w+)\s*\(/);
        if (methodMatch) {
            methods.push({
                name: methodMatch[1],
                line: i,
                definition: line
            });
        }
    }

    return methods;
}

/**
 * 解析枚举值
 */
function parseEnumerationValues(lines: string[], startLine: number): Array<{name: string, line: number, definition: string}> {
    const values: Array<{name: string, line: number, definition: string}> = [];

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === 'EndEnumeration') {
            break;
        }

        // 解析枚举值定义
        const valueMatch = line.match(/#\s*(\w+)\s*=/);
        if (valueMatch) {
            values.push({
                name: valueMatch[1],
                line: i,
                definition: line
            });
        }
    }

    return values;
}

/**
 * 解析包含文件路径
 */
function resolveIncludePath(includePath: string, baseDirectory: string): string {
    if (includePath.startsWith('./') || includePath.startsWith('.\\')) {
        includePath = includePath.substring(2);
    }

    if (baseDirectory && !includePath.includes('/') && !includePath.includes('\\')) {
        // 简单的文件名，添加到基础目录
        return `${baseDirectory}${includePath}`;
    }

    return includePath;
}

/**
 * 检查是否是条件包含
 */
function isConditionalInclude(line: string): boolean {
    return line.startsWith('If') || line.includes('CompilerIf');
}

/**
 * 检查是否是导出的符号
 */
function isExportedSymbol(line: string): boolean {
    return line.includes('Export') || line.includes('Public');
}

/**
 * 检测循环依赖
 */
function detectCircularDependencies(dependencies: Map<string, string[]>, circularDependencies: string[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function dfs(node: string): boolean {
        if (recursionStack.has(node)) {
            // 发现循环依赖
            const cycle = Array.from(recursionStack).slice(recursionStack.has(node) ? Array.from(recursionStack).indexOf(node) : 0);
            cycle.push(node);
            circularDependencies.push(cycle.join(' -> '));
            return true;
        }

        if (visited.has(node)) {
            return false;
        }

        visited.add(node);
        recursionStack.add(node);

        const neighbors = dependencies.get(node) || [];
        for (const neighbor of neighbors) {
            dfs(neighbor);
        }

        recursionStack.delete(node);
        return false;
    }

    for (const [node] of dependencies) {
        if (!visited.has(node)) {
            dfs(node);
        }
    }
}

/**
 * 获取包含文件的所有依赖（递归）
 */
export function getAllIncludeDependencies(document: TextDocument, baseDirectory: string = ''): string[] {
    const analysis = parseIncludeFiles(document, baseDirectory);
    const allDependencies = new Set<string>();

    function collectDeps(filePath: string) {
        const deps = analysis.dependencies.get(filePath) || [];
        for (const dep of deps) {
            if (!allDependencies.has(dep)) {
                allDependencies.add(dep);
                collectDeps(dep);
            }
        }
    }

    const currentFile = URI.parse(document.uri).fsPath;
    collectDeps(currentFile);

    return Array.from(allDependencies);
}

/**
 * 验证包含文件是否存在
 */
export function validateIncludeFiles(document: TextDocument, baseDirectory: string = '', existingFiles: Set<string>): string[] {
    const analysis = parseIncludeFiles(document, baseDirectory);
    const missingFiles: string[] = [];

    for (const include of analysis.includeFiles) {
        if (!existingFiles.has(include.resolvedPath)) {
            missingFiles.push(include.resolvedPath);
        }
    }

    return missingFiles;
}