/**
 * 代码补全提供者
 * 为PureBasic提供智能代码补全功能
 */

import {
    CompletionItem,
    CompletionItemKind,
    CompletionParams,
    CompletionList,
    InsertTextFormat
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    keywords, types, allBuiltInFunctions, arrayFunctions, listFunctions, mapFunctions,
    windowsApiFunctions, graphicsFunctions, networkFunctions, databaseFunctions, threadFunctions,
    zeroParamBuiltInFunctions, parsePureBasicConstantDefinition
} from '../utils/constants';
import { getModuleFunctionCompletions as getModuleFunctions, getAvailableModules, getModuleExports } from '../utils/module-resolver';
import { analyzeScopesAndVariables, getActiveUsedModules } from '../utils/scope-manager';
import { parseIncludeFiles } from '../utils/module-resolver';
import { withErrorHandling, withAsyncErrorHandling, getErrorHandler } from '../utils/error-handler';
import * as fs from 'fs';

/**
 * 处理代码补全请求
 */
export function handleCompletion(
    params: CompletionParams,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): CompletionList {
    try {
        return handleCompletionInternal(params, document, documentCache);
    } catch (error) {
        console.error('Completion provider error:', error);
        return { isIncomplete: false, items: [] };
    }
}

function handleCompletionInternal(
    params: CompletionParams,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): CompletionList {
    const completionItems: CompletionItem[] = [];
    const position = params.position;
    const text = document.getText();
    const lines = text.split('\n');

    // 边界检查
    if (position.line < 0 || position.line >= lines.length) {
        return { isIncomplete: false, items: [] };
    }

    const currentLine = lines[position.line];
    const linePrefix = currentLine.substring(0, position.character);

    // 获取触发补全的上下文
    const context = getTriggerContext(linePrefix);

    // 结构体成员访问补全 var\member
    if (context.isAfterStructAccess) {
        const documentText = document.getText();
        const scopeAnalysis = analyzeScopesAndVariables(documentText, position.line);
        const normalizeVar = (n: string) => n.replace(/^\*/, '').replace(/\([^)]*\)$/, '');
        const targetVar = normalizeVar(context.structVarName);
        const varInfo = scopeAnalysis.availableVariables.find(v => v.name.toLowerCase() === targetVar.toLowerCase());
        if (!varInfo) {
            return { isIncomplete: false, items: [] };
        }

        const baseType = getBaseType(varInfo.type);
        if (!baseType) {
            return { isIncomplete: false, items: [] };
        }

        const structIndex = buildStructureIndex(document, documentCache);
        const members = structIndex.get(baseType) || [];
        const items = members
            .filter(m => m.name.toLowerCase().startsWith(context.structMemberPrefix.toLowerCase()))
            .map((m, idx) => ({
                label: m.name,
                kind: CompletionItemKind.Field,
                data: `struct_${baseType}_${m.name}_${idx}`,
                detail: `${baseType}::${m.name}${m.type ? ' : ' + m.type : ''}`,
                documentation: `Structure ${baseType} member ${m.name}${m.type ? ' of type ' + m.type : ''}`
            }));

        return { isIncomplete: false, items };
    }

    // 常量上下文（以 # 开头）：仅补全常量
    if (context.isConstantContext) {
        const items: CompletionItem[] = [];
        const docSymbols = extractDocumentSymbols(document, documentCache);
        docSymbols.constants.forEach((c, idx) => {
            if (c.name.toLowerCase().startsWith(context.constPrefix.toLowerCase())) {
                items.push({
                    label: `#${c.name}`,
                    kind: CompletionItemKind.Constant,
                    data: `const_${idx}`,
                    detail: `Constant #${c.name}`,
                    documentation: c.value ? `#${c.name} = ${c.value}` : `Constant ${c.name}`,
                    insertText: `#${c.name}`,
                    insertTextFormat: InsertTextFormat.PlainText
                });
            }
        });
        // UseModule 导出的常量
        const usedModules2 = getActiveUsedModules(document.getText(), position.line);
        usedModules2.forEach(mod => {
            const ex = getModuleExports(mod, document, documentCache);
            ex.constants.forEach((c, i2) => {
                if (c.name.toLowerCase().startsWith(context.constPrefix.toLowerCase())) {
                    items.push({
                        label: `#${c.name}`,
                        kind: CompletionItemKind.Constant,
                        data: `usemodule_const_${mod}_${i2}`,
                        detail: `UseModule ${mod} → #${c.name}`,
                        documentation: c.value ? `#${c.name} = ${c.value}` : `Constant ${c.name}`,
                        insertText: `#${c.name}`,
                        insertTextFormat: InsertTextFormat.PlainText
                    });
                }
            });
        });

        return { isIncomplete: false, items };
    }

    // 检查是否是模块调用 Module::
    if (context.isAfterModuleOperator) {
        const exports = getModuleExports(context.moduleName, document, documentCache);
        const funcFiltered = context.isModuleConstantContext ? [] : (context.moduleMemberPrefix
            ? exports.functions.filter(f => f.name.toLowerCase().startsWith(context.moduleMemberPrefix.toLowerCase()))
            : exports.functions);
        const constFiltered = context.isModuleConstantContext
            ? exports.constants.filter(c => c.name.toLowerCase().startsWith(context.moduleConstPrefix.toLowerCase()))
            : (context.moduleMemberPrefix ? exports.constants.filter(c => c.name.toLowerCase().startsWith(context.moduleMemberPrefix.toLowerCase())) : exports.constants);
        const structFiltered = context.isModuleConstantContext ? [] : (context.moduleMemberPrefix
            ? exports.structures.filter(s => s.name.toLowerCase().startsWith(context.moduleMemberPrefix.toLowerCase()))
            : exports.structures);

        const items: CompletionItem[] = [];
        // 函数
        items.push(...funcFiltered.map((func, index) => ({
            label: func.name,
            kind: CompletionItemKind.Function,
            data: `module_${context.moduleName}_${func.name}_${index}`,
            detail: `${context.moduleName}::${func.name}`,
            documentation: func.documentation,
            insertText: func.insertText,
            insertTextFormat: InsertTextFormat.PlainText,
            command: func.insertText.endsWith('(')
                ? { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' }
                : undefined
        })));
        // 常量（使用 #Name 形式）
        items.push(...constFiltered.map((c, index) => ({
            label: `#${c.name}`,
            kind: CompletionItemKind.Constant,
            data: `module_const_${context.moduleName}_${c.name}_${index}`,
            detail: `Constant ${context.moduleName}::#${c.name}`,
            documentation: c.value ? `#${c.name} = ${c.value}` : `Constant ${c.name}`,
            insertText: `#${c.name}`,
            insertTextFormat: InsertTextFormat.PlainText
        })));
        // 结构/类型
        items.push(...structFiltered.map((s, index) => ({
            label: s.name,
            kind: CompletionItemKind.Class,
            data: `module_struct_${context.moduleName}_${s.name}_${index}`,
            detail: `Structure ${context.moduleName}::${s.name}`,
            documentation: `Structure ${s.name}`,
            insertText: s.name,
            insertTextFormat: InsertTextFormat.PlainText
        })));
        // 接口
        const ifaceFiltered = (exports.interfaces || []).filter(ifc =>
            context.isModuleConstantContext ? false : (!context.moduleMemberPrefix || ifc.name.toLowerCase().startsWith(context.moduleMemberPrefix.toLowerCase()))
        );
        items.push(...ifaceFiltered.map((it, index) => ({
            label: it.name,
            kind: CompletionItemKind.Interface,
            data: `module_interface_${context.moduleName}_${it.name}_${index}`,
            detail: `Interface ${context.moduleName}::${it.name}`,
            documentation: `Interface ${it.name}`,
            insertText: it.name,
            insertTextFormat: InsertTextFormat.PlainText
        })));
        // 枚举名（作为类型/分组名）
        const enumFiltered = (exports.enumerations || []).filter(en =>
            context.isModuleConstantContext ? false : (!context.moduleMemberPrefix || en.name.toLowerCase().startsWith(context.moduleMemberPrefix.toLowerCase()))
        );
        items.push(...enumFiltered.map((en, index) => ({
            label: en.name,
            kind: CompletionItemKind.Enum,
            data: `module_enum_${context.moduleName}_${en.name}_${index}`,
            detail: `Enumeration ${context.moduleName}::${en.name}`,
            documentation: `Enumeration ${en.name}`,
            insertText: en.name,
            insertTextFormat: InsertTextFormat.PlainText
        })));

        return { isIncomplete: false, items };
    }

    // 使用作用域管理器获取当前可见的变量
    const documentText = document.getText();
    const scopeAnalysis = analyzeScopesAndVariables(documentText, position.line);

    // 添加当前作用域中可见的变量
    scopeAnalysis.availableVariables.forEach((variable, index) => {
        if (variable.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            let detail = variable.type;
            if (variable.isGlobal) detail += ' (global)';
            if (variable.isProtected) detail += ' (protected)';
            if (variable.isStatic) detail += ' (static)';
            if (variable.isParameter) detail += ' (parameter)';

            completionItems.push({
                label: variable.name,
                kind: variable.isParameter ? CompletionItemKind.Value : CompletionItemKind.Variable,
                data: 'var_' + index,
                detail: `${detail} ${variable.name}`,
                documentation: `Variable: ${variable.name} (defined at line ${variable.definitionLine + 1})`
            });
        }
    });

    // 从当前文档和所有文档中提取过程和常量（不受作用域限制）
    const documentSymbols = extractDocumentSymbols(document, documentCache);

    // 添加文档中定义的过程/函数
    documentSymbols.procedures.forEach((proc, index) => {
        if (proc.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: proc.name,
                kind: CompletionItemKind.Function,
                data: 'proc_' + index,
                detail: `Procedure ${proc.signature}`,
                documentation: `User-defined procedure: ${proc.name}`,
                insertText: proc.insertText,
                insertTextFormat: InsertTextFormat.PlainText,
                command: proc.insertText.endsWith('(')
                    ? { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' }
                    : undefined
            });
        }
    });

    // 添加常量（常量通常是全局的）
    documentSymbols.constants.forEach((constant, index) => {
        if (constant.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: constant.name,
                kind: CompletionItemKind.Constant,
                data: 'const_' + index,
                detail: `Constant ${constant.name}`,
                documentation: `Constant: ${constant.name} = ${constant.value || 'unknown'}`
            });
        }
    });

    // 添加关键字补全
    keywords.forEach((keyword, index) => {
        if (keyword.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: keyword,
                kind: CompletionItemKind.Keyword,
                data: 'kw_' + index,
                detail: 'PureBasic Keyword',
                documentation: `PureBasic keyword: ${keyword}`
            });
        }
    });

    // 添加类型补全
    types.forEach((type, index) => {
        if (type.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: type,
                kind: CompletionItemKind.Class,
                data: 'type_' + index,
                detail: 'PureBasic Type',
                documentation: `PureBasic built-in type: ${type}`
            });
        }
    });

    // 添加结构体/接口/枚举名（从文档/包含中解析的定义名）
    documentSymbols.structures.forEach((s, index) => {
        if (s.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: s.name,
                kind: CompletionItemKind.Class,
                data: 'struct_' + index,
                detail: 'Structure',
                documentation: `Structure ${s.name}`
            });
        }
    });
    documentSymbols.interfaces.forEach((it, index) => {
        if (it.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: it.name,
                kind: CompletionItemKind.Interface,
                data: 'iface_' + index,
                detail: 'Interface',
                documentation: `Interface ${it.name}`
            });
        }
    });
    documentSymbols.enumerations.forEach((en, index) => {
        if (en.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: en.name,
                kind: CompletionItemKind.Enum,
                data: 'enum_' + index,
                detail: 'Enumeration',
                documentation: `Enumeration ${en.name}`
            });
        }
    });

    // UseModule 感知：为已导入模块的函数提供补全（无需 Module::）
    const usedModules = getActiveUsedModules(documentText, position.line);
    const pushedLabels = new Set<string>(completionItems.map(i => i.label));
    usedModules.forEach((mod) => {
        const ex = getModuleExports(mod, document, documentCache);
        // 函数
        ex.functions.forEach((func, idx) => {
            if (func.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
                const key = `${func.name}`;
                if (pushedLabels.has(key)) return;
                pushedLabels.add(key);
                completionItems.push({
                    label: func.name,
                    kind: CompletionItemKind.Function,
                    data: `usemodule_${mod}_${func.name}_${idx}`,
                    detail: `UseModule ${mod} → ${func.name}`,
                    documentation: func.documentation,
                    insertText: func.insertText,
                    insertTextFormat: InsertTextFormat.PlainText,
                    command: func.insertText.endsWith('(')
                        ? { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' }
                        : undefined
                });
            }
        });
        // 结构名（类型）
        ex.structures.forEach((s, idx) => {
            if (s.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
                const key = `${s.name}`;
                if (pushedLabels.has(key)) return;
                pushedLabels.add(key);
                completionItems.push({
                    label: s.name,
                    kind: CompletionItemKind.Class,
                    data: `usemodule_struct_${mod}_${s.name}_${idx}`,
                    detail: `UseModule ${mod} → Structure ${s.name}`,
                    documentation: `Structure ${s.name}`,
                    insertText: s.name,
                    insertTextFormat: InsertTextFormat.PlainText
                });
            }
        });
        // 接口
        (ex.interfaces || []).forEach((it, idx) => {
            if (it.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
                const key = `${it.name}`;
                if (pushedLabels.has(key)) return;
                pushedLabels.add(key);
                completionItems.push({
                    label: it.name,
                    kind: CompletionItemKind.Interface,
                    data: `usemodule_interface_${mod}_${it.name}_${idx}`,
                    detail: `UseModule ${mod} → Interface ${it.name}`,
                    documentation: `Interface ${it.name}`,
                    insertText: it.name,
                    insertTextFormat: InsertTextFormat.PlainText
                });
            }
        });
        // 枚举名
        (ex.enumerations || []).forEach((en, idx) => {
            if (en.name.toLowerCase().startsWith(context.prefix.toLowerCase())) {
                const key = `${en.name}`;
                if (pushedLabels.has(key)) return;
                pushedLabels.add(key);
                completionItems.push({
                    label: en.name,
                    kind: CompletionItemKind.Enum,
                    data: `usemodule_enum_${mod}_${en.name}_${idx}`,
                    detail: `UseModule ${mod} → Enumeration ${en.name}`,
                    documentation: `Enumeration ${en.name}`,
                    insertText: en.name,
                    insertTextFormat: InsertTextFormat.PlainText
                });
            }
        });
    });

    // 添加模块名称补全
    const availableModules = getAvailableModules(document, documentCache);
    availableModules.forEach((module, index) => {
        if (module.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            completionItems.push({
                label: module,
                kind: CompletionItemKind.Module,
                data: 'module_' + index,
                detail: `Module ${module}`,
                documentation: `Module: ${module} - Available for use with :: operator`,
                insertText: `${module}::`,
                insertTextFormat: InsertTextFormat.PlainText
            });
        }
    });

    // 添加内置函数补全
    allBuiltInFunctions.forEach((func, index) => {
        if (func.toLowerCase().startsWith(context.prefix.toLowerCase())) {
            // 大多数内置函数都有参数，所以只插入函数名和左括号
            // 让VS Code自动显示参数提示
            const hasZeroParams = zeroParamBuiltInFunctions.includes(func);
            const insertText = hasZeroParams ? `${func}()` : `${func}(`;

            // 确定函数类型
            let functionType = 'PureBasic Built-in Function';
            let documentation = `PureBasic built-in function: ${func}()`;

            if (arrayFunctions.includes(func)) {
                functionType = 'Array Function';
                documentation = `Array function: ${func}() - Operations on arrays`;
            } else if (listFunctions.includes(func)) {
                functionType = 'List Function';
                documentation = `List function: ${func}() - Operations on linked lists`;
            } else if (mapFunctions.includes(func)) {
                functionType = 'Map Function';
                documentation = `Map function: ${func}() - Operations on associative arrays`;
            } else if (windowsApiFunctions.includes(func)) {
                functionType = 'Windows API Function';
                documentation = `Windows API function: ${func}() - Direct system calls`;
            } else if (graphicsFunctions.includes(func)) {
                functionType = 'Graphics/Game Function';
                documentation = `Graphics function: ${func}() - 2D graphics, sprites, sounds`;
            } else if (networkFunctions.includes(func)) {
                functionType = 'Network Function';
                documentation = `Network function: ${func}() - Network communication`;
            } else if (databaseFunctions.includes(func)) {
                functionType = 'Database Function';
                documentation = `Database function: ${func}() - Database operations`;
            } else if (threadFunctions.includes(func)) {
                functionType = 'Threading Function';
                documentation = `Threading function: ${func}() - Multi-threading and synchronization`;
            }

            completionItems.push({
                label: func,
                kind: CompletionItemKind.Function,
                data: 'builtin_' + index,
                detail: functionType,
                documentation: documentation,
                insertText: insertText,
                insertTextFormat: InsertTextFormat.PlainText,
                command: hasZeroParams ? undefined : { command: 'editor.action.triggerParameterHints', title: 'Trigger Parameter Hints' }
            });
        }
    });

    // 添加代码片段
    const snippets = [
        {
            label: 'if',
            kind: CompletionItemKind.Snippet,
            insertText: 'If ${1:condition}\n\t${2:// code}\nEndIf',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'If statement',
            documentation: 'If-EndIf control structure'
        },
        {
            label: 'for',
            kind: CompletionItemKind.Snippet,
            insertText: 'For ${1:i} = ${2:0} To ${3:10}\n\t${4:// code}\nNext',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'For loop',
            documentation: 'For-Next loop structure'
        },
        {
            label: 'while',
            kind: CompletionItemKind.Snippet,
            insertText: 'While ${1:condition}\n\t${2:// code}\nWend',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'While loop',
            documentation: 'While-Wend loop structure'
        },
        {
            label: 'procedure',
            kind: CompletionItemKind.Snippet,
            insertText: 'Procedure ${1:Name}(${2:parameters})\n\t${3:// code}\nEndProcedure',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Procedure',
            documentation: 'Procedure definition'
        },
        {
            label: 'structure',
            kind: CompletionItemKind.Snippet,
            insertText: 'Structure ${1:Name}\n\t${2:// fields}\nEndStructure',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Structure',
            documentation: 'Structure definition'
        },
        {
            label: 'array',
            kind: CompletionItemKind.Snippet,
            insertText: 'Dim ${1:ArrayName}.${2:i}(${3:size})',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Array Declaration',
            documentation: 'Declare an array with specified size and type'
        },
        {
            label: 'newlist',
            kind: CompletionItemKind.Snippet,
            insertText: 'NewList ${1:ListName}.${2:i}()',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'List Declaration',
            documentation: 'Create a new linked list'
        },
        {
            label: 'newmap',
            kind: CompletionItemKind.Snippet,
            insertText: 'NewMap ${1:MapName}.${2:i}()',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Map Declaration',
            documentation: 'Create a new associative array (map)'
        },
        {
            label: 'foreach',
            kind: CompletionItemKind.Snippet,
            insertText: 'ForEach ${1:ListName}()\n\t${2:// code}\nNext',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'ForEach Loop',
            documentation: 'Iterate through all elements in a list'
        }
    ];

    completionItems.push(...snippets);

    return {
        isIncomplete: false,
        items: completionItems
    };
}

/**
 * 获取触发补全的上下文
 */
function getTriggerContext(linePrefix: string): {
    prefix: string;
    isAfterDot: boolean;
    isInString: boolean;
    isAfterModuleOperator: boolean;
    moduleName: string;
    moduleMemberPrefix: string;
    isConstantContext: boolean;
    constPrefix: string;
    isModuleConstantContext: boolean;
    moduleConstPrefix: string;
    isAfterStructAccess: boolean;
    structVarName: string;
    structMemberPrefix: string;
} {
    // 检查是否在字符串中
    const quoteCount = (linePrefix.match(/"/g) || []).length;
    const isInString = quoteCount % 2 === 1;

    // 检查是否在点后面 (成员访问)
    const isAfterDot = linePrefix.trim().endsWith('.');

    // 检查是否在模块操作符后面：Module:: 或 Module::# 或 Module::前缀
    const moduleConstMatch = linePrefix.match(/(\w+)::#(\w*)$/);
    const moduleMatch = moduleConstMatch || linePrefix.match(/(\w+)::(\w*)$/);
    const isAfterModuleOperator = !!moduleMatch;
    const moduleName = moduleMatch ? moduleMatch[1] : '';
    const moduleMemberPrefix = moduleConstMatch ? '' : (moduleMatch ? moduleMatch[2] : '');
    const isModuleConstantContext = !!moduleConstMatch;
    const moduleConstPrefix = moduleConstMatch ? moduleConstMatch[2] : '';

    // 检查是否在常量上下文：#Name...
    const constMatch = linePrefix.match(/#([a-zA-Z_][a-zA-Z0-9_$.@]*)$/);
    const isConstantContext = !!constMatch && !isAfterModuleOperator; // 非模块的 #
    const constPrefix = constMatch ? constMatch[1] : '';

    // 检查是否为结构体成员访问 var\member
    const structMatch = linePrefix.match(/([A-Za-z_][A-Za-z0-9_]*|\*[A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\\(\w*)$/);
    const isAfterStructAccess = !!structMatch;
    const structVarName = structMatch ? structMatch[1] : '';
    const structMemberPrefix = structMatch ? structMatch[2] : '';

    // 获取当前单词前缀
    const match = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
    const prefix = match ? match[1] : '';

    return {
        prefix,
        isAfterDot,
        isInString,
        isAfterModuleOperator,
        moduleName,
        moduleMemberPrefix,
        isConstantContext,
        constPrefix,
        isModuleConstantContext,
        moduleConstPrefix,
        isAfterStructAccess,
        structVarName,
        structMemberPrefix
    };
}

// 提取基础类型名（去除指针/数组/标注）
function getBaseType(typeStr: string): string {
    if (!typeStr) return '';
    // 去掉后缀注释，如 " (array)", " (pointer)"
    const cleaned = typeStr.split(' ')[0];
    // 处理 *Type
    const noPtr = cleaned.startsWith('*') ? cleaned.substring(1) : cleaned;
    // 处理 Type[]
    const arrIdx = noPtr.indexOf('[');
    const base = arrIdx > -1 ? noPtr.substring(0, arrIdx) : noPtr;
    // 过滤内置短类型（i,s,f等），只对结构体名（通常是驼峰）有意义
    return base;
}

// 构建结构体索引：结构体名 -> 成员列表
function buildStructureIndex(document: TextDocument, documentCache: Map<string, TextDocument>): Map<string, Array<{name: string; type?: string}>> {
    const map = new Map<string, Array<{name: string; type?: string}>>();

    const pushMember = (structName: string, member: {name: string; type?: string}) => {
        const list = map.get(structName) || [];
        // 去重同名
        if (!list.some(m => m.name === member.name)) list.push(member);
        map.set(structName, list);
    };

    const addFromText = (text: string) => {
        const lines = text.split('\n');
        let current: string | null = null;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw.trim();
            if (line === '' || line.startsWith(';')) continue;
            const start = line.match(/^Structure\s+(\w+)/i);
            if (start) { current = start[1]; continue; }
            if (line.match(/^EndStructure\b/i)) { current = null; continue; }
            if (current) {
                const m = line.match(/^(\*?)(\w+)(?:\.(\w+))?/);
                if (m) {
                    const name = m[2];
                    const type = m[3];
                    pushMember(current, { name, type });
                }
            }
        }
    };

    // 当前文档
    addFromText(document.getText());
    // 已打开文档
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) addFromText(doc.getText());
    }
    // Include 文件
    try {
        const includes = parseIncludeFiles(document, documentCache);
        for (const file of includes) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                addFromText(content);
            } catch (error) {
                console.error(`Failed to read include file ${file}:`, error);
            }
        }
    } catch (error) {
        console.error('Failed to parse include files:', error);
    }

    return map;
}


/**
 * 从文档中提取符号信息
 */
function extractDocumentSymbols(document: TextDocument, documentCache: Map<string, TextDocument>) {
    const symbols = {
        procedures: [] as Array<{name: string, signature: string, insertText: string}>,
        constants: [] as Array<{name: string, value?: string}>,
        structures: [] as Array<{name: string}>,
        interfaces: [] as Array<{name: string}>,
        enumerations: [] as Array<{name: string}>
    };

    // 分析当前文档
    analyzeDocumentSymbols(document, symbols);

    // 分析缓存中的其他文档
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) {
            analyzeDocumentSymbols(doc, symbols);
        }
    }

    return symbols;
}

interface SymbolCollection {
    procedures: Array<{name: string, signature: string, insertText: string}>;
    constants: Array<{name: string, value?: string}>;
    structures: Array<{name: string}>;
    interfaces: Array<{name: string}>;
    enumerations: Array<{name: string}>;
}

/**
 * 分析文档中的符号
 */
function analyzeDocumentSymbols(document: TextDocument, symbols: SymbolCollection) {
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 查找过程定义
        const procMatch = line.match(/^Procedure(?:\.(\w+))?\s+(\w+)\s*\(([^)]*)\)/i);
        if (procMatch) {
            const returnType = procMatch[1] || '';
            const name = procMatch[2];
            const params = procMatch[3] || '';
            const signature = returnType ? `.${returnType} ${name}(${params})` : `${name}(${params})`;
            // 对于有参数的函数，只插入函数名和左括号，让VS Code触发参数提示
            // 对于无参数的函数，插入完整的函数调用
            const insertText = params ? `${name}(` : `${name}()`;

            symbols.procedures.push({
                name,
                signature,
                insertText
            });
        }

        // 查找常量定义
        const constMatch = parsePureBasicConstantDefinition(line);
        if (constMatch) {
            const name = constMatch.name;
            const value = constMatch.value;
            symbols.constants.push({ name, value });
        }

        // 查找结构体定义
        const structMatch = line.match(/^Structure\s+(\w+)\b/i);
        if (structMatch) {
            symbols.structures.push({ name: structMatch[1] });
        }

        // 查找接口定义
        const ifaceMatch = line.match(/^Interface\s+(\w+)\b/i);
        if (ifaceMatch) {
            symbols.interfaces.push({ name: ifaceMatch[1] });
        }

        // 查找枚举定义
        const enumMatch = line.match(/^Enumeration\s+(\w+)\b/i);
        if (enumMatch) {
            symbols.enumerations.push({ name: enumMatch[1] });
        }
    }
}

/**
 * 解析补全项目的详细信息
 */
export function handleCompletionResolve(item: CompletionItem): CompletionItem {
    // 可以在这里添加更详细的文档或插入文本
    return item;
}
