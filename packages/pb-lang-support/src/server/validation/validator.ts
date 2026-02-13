/**
 * Main Validator
 * Integrates all validation modules, provides a unified validation interface
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
 * Create a new validation context
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
 * Validate PureBasic code
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

        // Skip empty lines and comments
        if (line === '' || line.startsWith(';')) {
            continue;
        }

        // Apply all validators
        validateProcedure(line, i, originalLine, context, diagnostics);
        validateVariables(line, i, originalLine, context, diagnostics);
        validateControlStructures(line, i, originalLine, context, diagnostics);
        validateDataStructures(line, i, originalLine, context, diagnostics);
        validateModules(line, i, originalLine, context, diagnostics);
        validateGeneric(line, i, originalLine, context, diagnostics);
    }

    // Check unclosed structures
    validateUnclosedStructures(context, lines, diagnostics);

    return diagnostics;
}
