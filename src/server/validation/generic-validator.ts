/**
 * Generic validator
 * Validates basic PureBasic syntax rules
 */

import { DiagnosticSeverity } from 'vscode-languageserver/node';
import { ValidatorFunction } from './types';
import { keywords, builtInFunctions } from '../utils/constants';

/**
 * Validates generic syntax rules
 */
export const validateGeneric: ValidatorFunction = (
    line: string,
    lineNum: number,
    originalLine: string,
    context,
    diagnostics
) => {
    // Validate constant definitions
    if (line.startsWith('#')) {
        const constMatch = line.match(/^#([a-zA-Z_][a-zA-Z0-9_]*\$?)\s*=\s*(.+)/);
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

    // Greatly simplified generic syntax validation to reduce false positives.
    // Only checks for very obvious syntax issues; specialized validators handle their own rules.

    // Skip comments, empty lines, and string literals
    if (line.trim().startsWith(';') || line.trim() === '' || line.includes('"') || line.includes("'")) {
        return;
    }

    // Check for obviously invalid patterns:
    // 1) Starts with an invalid character (but not a keyword, identifier, constant, or comment)
    const invalidStartPattern = /^\s*[^a-zA-Z_#;*\\@]/;

    // Only report on genuinely invalid lines
    if (invalidStartPattern.test(line)) {
        // Whitelist: allowed special cases
        const isValidSpecialCase =
            line.includes('=') ||           // assignment
            line.includes('(') ||           // function call
            line.includes('[') ||           // array access
            line.includes('.') ||           // member access
            line.includes('\\') ||          // file path
            line.startsWith('*') ||         // pointer variable (e.g., *Ptr in structures)
            line.startsWith('@') ||         // address operator
            keywords.some(kw => line.startsWith(kw)) ||  // starts with a keyword
            builtInFunctions.some(fn => line.includes(fn)); // contains a built-in function

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
