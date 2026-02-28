/**
 * 签名帮助提供者
 * 为PureBasic提供函数参数提示功能
 */

import {
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    TextDocumentPositionParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getModuleFunctionCompletions as getModuleFunctions } from '../utils/module-resolver';
import { getActiveUsedModules } from '../utils/scope-manager';
import { escapeRegExp } from '../utils/string-utils';

/**
 * 处理签名帮助请求
 */
export function handleSignatureHelp(
    params: TextDocumentPositionParams,
    document: TextDocument,
    documentCache: Map<string, TextDocument>
): SignatureHelp | null {
    const position = params.position;
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line] || '';
    const linePrefix = currentLine.substring(0, position.character);

    // 查找函数调用（支持 Module::Func 与 Func）
    const functionCall = findFunctionCall(linePrefix);
    if (!functionCall) {
        return null;
    }

    // 查找函数定义
    let functionDefinition = findFunctionDefinition(
        functionCall.functionName,
        document,
        documentCache,
        functionCall.moduleName || null,
        position.line
    );

    if (!functionDefinition) {
        return null;
    }

    // 计算当前参数位置
    const activeParameter = calculateActiveParameter(functionCall.parametersText);

    // 创建签名信息
    const signature: SignatureInformation = {
        label: functionDefinition.signature,
        documentation: functionDefinition.documentation,
        parameters: functionDefinition.parameters
    };

    return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: Math.min(activeParameter, functionDefinition.parameters.length - 1)
    };
}

/**
 * 查找当前行中的函数调用
 */
function findFunctionCall(linePrefix: string): {
    moduleName?: string;
    functionName: string;
    parametersText: string;
} | null {
    // 1) 模块调用：Module::Func(
    const modCall = linePrefix.match(/(\w+)::(\w+)\s*\(([^)]*)$/);
    if (modCall) {
        return {
            moduleName: modCall[1],
            functionName: modCall[2],
            parametersText: modCall[3] || ''
        };
    }

    // 2) 普通调用：Func(
    const call = linePrefix.match(/(\w+)\s*\(([^)]*)$/);
    if (call) {
        return {
            functionName: call[1],
            parametersText: call[2] || ''
        };
    }

    return null;
}

/**
 * 查找函数定义
 */
function findFunctionDefinition(
    functionName: string,
    document: TextDocument,
    documentCache: Map<string, TextDocument>,
    moduleName: string | null,
    currentLine: number
): {
    signature: string;
    documentation: string;
    parameters: ParameterInformation[];
} | null {
    // 模块函数优先（若显式指定了模块名）
    if (moduleName) {
        const funcs = getModuleFunctions(moduleName, document, documentCache);
        const item = funcs.find(f => f.name.toLowerCase() === functionName.toLowerCase());
        if (item) {
            const parameters = parseParameters(item.parameters || '');
            return {
                signature: item.signature,
                documentation: item.documentation,
                parameters
            };
        }
        // 若模块内未找到，后续再尝试用户过程/内置
    }

    // 在当前文档中查找用户过程
    let definition = searchFunctionInDocument(functionName, document);
    if (definition) return definition;

    // 在其他已打开文档中查找
    for (const [uri, doc] of documentCache) {
        if (uri !== document.uri) {
            definition = searchFunctionInDocument(functionName, doc);
            if (definition) return definition;
        }
    }

    // UseModule 导入的模块里查找（未指定模块名时）
    if (!moduleName) {
        const used = getActiveUsedModules(document.getText(), currentLine);
        for (const mod of used) {
            const funcs = getModuleFunctions(mod, document, documentCache);
            const item = funcs.find(f => f.name.toLowerCase() === functionName.toLowerCase());
            if (item) {
                const parameters = parseParameters(item.parameters || '');
                return {
                    signature: item.signature,
                    documentation: item.documentation,
                    parameters
                };
            }
        }
    }

    // 检查是否是内置函数
    return getBuiltInFunctionSignature(functionName);
}

/**
 * 在文档中搜索函数定义
 */
function searchFunctionInDocument(
    functionName: string,
    document: TextDocument
): {
    signature: string;
    documentation: string;
    parameters: ParameterInformation[];
} | null {
    const escapedFunctionName = escapeRegExp(functionName);
    const text = document.getText();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 匹配过程定义
        const procMatch = line.match(new RegExp(`^Procedure(?:\\.(\\w+))?\\s+(${escapedFunctionName})\\s*\\(([^)]*)\\)`, 'i'));
        if (procMatch) {
            const returnType = procMatch[1] || '';
            const name = procMatch[2];
            const paramsText = procMatch[3] || '';

            const signature = returnType
                ? `Procedure.${returnType} ${name}(${paramsText})`
                : `Procedure ${name}(${paramsText})`;

            const parameters = parseParameters(paramsText);

            return {
                signature,
                documentation: `User-defined procedure: ${name}`,
                parameters
            };
        }
    }

    return null;
}

/**
 * 解析参数列表
 */
function parseParameters(paramsText: string): ParameterInformation[] {
    if (!paramsText.trim()) {
        return [];
    }

    const parameters: ParameterInformation[] = [];
    const paramList = paramsText.split(',');

    for (const param of paramList) {
        const trimmedParam = param.trim();
        if (trimmedParam) {
            // 解析参数名和类型
            const match = trimmedParam.match(/(\*?)(\w+)(?:\.(\w+))?/);
            if (match) {
                const isPointer = match[1];
                const name = match[2];
                const type = match[3] || 'unknown';

                const label = `${isPointer}${name}.${type}`;
                const documentation = `Parameter: ${name} (${type})`;

                parameters.push({
                    label,
                    documentation
                });
            }
        }
    }

    return parameters;
}

/**
 * 获取内置函数的签名
 */
function getBuiltInFunctionSignature(functionName: string): {
    signature: string;
    documentation: string;
    parameters: ParameterInformation[];
} | null {
    // 常用内置函数的签名定义
    const builtInSignatures: { [key: string]: any } = {
        'Debug': {
            signature: 'Debug(Text$)',
            documentation: 'Display debug information',
            parameters: [
                { label: 'Text$', documentation: 'String to display in debug output' }
            ]
        },
        'OpenWindow': {
            signature: 'OpenWindow(#Window, X, Y, Width, Height, Title$, Flags)',
            documentation: 'Open a new window',
            parameters: [
                { label: '#Window', documentation: 'Window identifier' },
                { label: 'X', documentation: 'X position' },
                { label: 'Y', documentation: 'Y position' },
                { label: 'Width', documentation: 'Window width' },
                { label: 'Height', documentation: 'Window height' },
                { label: 'Title$', documentation: 'Window title' },
                { label: 'Flags', documentation: 'Window flags' }
            ]
        },
        'MessageRequester': {
            signature: 'MessageRequester(Title$, Text$, Flags)',
            documentation: 'Display a message dialog',
            parameters: [
                { label: 'Title$', documentation: 'Dialog title' },
                { label: 'Text$', documentation: 'Message text' },
                { label: 'Flags', documentation: 'Dialog flags' }
            ]
        }
    };

    const lowerFunctionName = functionName.toLowerCase();
    for (const [key, value] of Object.entries(builtInSignatures)) {
        if (key.toLowerCase() === lowerFunctionName) {
            return value;
        }
    }

    return null;
}

/**
 * 计算当前活动参数的索引
 */
function calculateActiveParameter(parametersText: string): number {
    if (!parametersText.trim()) {
        return 0;
    }

    // 计算逗号数量，但要考虑括号嵌套和字符串
    let commaCount = 0;
    let parenDepth = 0;
    let inString = false;

    for (let i = 0; i < parametersText.length; i++) {
        const char = parametersText[i];

        if (char === '"' && (i === 0 || parametersText[i-1] !== '\\')) {
            inString = !inString;
        } else if (!inString) {
            if (char === '(') {
                parenDepth++;
            } else if (char === ')') {
                parenDepth--;
            } else if (char === ',' && parenDepth === 0) {
                commaCount++;
            }
        }
    }

    return commaCount;
}
