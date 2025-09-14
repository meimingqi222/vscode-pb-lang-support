/**
 * 主验证器
 * 整合所有验证模块，提供统一的验证接口
 */

import { Diagnostic } from 'vscode-languageserver/node';
import { ValidationContext } from './types';
import { validateProcedure } from './procedure-validator';
import { validateVariables } from './variable-validator';
import { validateControlStructures } from './control-structure-validator';
import { validateDataStructures } from './data-structure-validator';
import { validateModules } from './module-validator';
import { validateGeneric } from './generic-validator';
import { validateUnclosedStructures } from './unclosed-structure-validator';
import { withErrorHandling, getErrorHandler } from '../utils/error-handler';

/**
 * 创建新的验证上下文
 */
export function createValidationContext(): ValidationContext {
    return {
        procedureStack: [],
        structureStack: [],
        ifStack: [],
        forStack: [],
        whileStack: [],
        repeatStack: [],
        selectStack: [],
        withStack: [],
        moduleStack: [],
        declareModuleStack: [],
        interfaceStack: []
    };
}

/**
 * 验证PureBasic代码
 */
export function validateDocument(text: string): Diagnostic[] {
    try {
        return validateDocumentInternal(text);
    } catch (error) {
        console.error('Document validation error:', error);
        return [];
    }
}

function validateDocumentInternal(text: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const context = createValidationContext();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const line = originalLine.trim();

        // 跳过空行和注释
        if (line === '' || line.startsWith(';')) {
            continue;
        }

        // 应用所有验证器
        validateProcedure(line, i, originalLine, context, diagnostics);
        validateVariables(line, i, originalLine, context, diagnostics);
        validateControlStructures(line, i, originalLine, context, diagnostics);
        validateDataStructures(line, i, originalLine, context, diagnostics);
        validateModules(line, i, originalLine, context, diagnostics);
        validateGeneric(line, i, originalLine, context, diagnostics);
    }

    // 检查未闭合的结构
    validateUnclosedStructures(context, lines, diagnostics);

    return diagnostics;
}
