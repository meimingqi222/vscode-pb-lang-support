/**
 * 补全上下文分析器
 * 负责分析代码补全的上下文信息
 */

import { Position, TextDocument } from 'vscode-languageserver';
import { CompletionContext } from './completion-types';

/**
 * 分析补全上下文
 */
export class CompletionContextAnalyzer {
    /**
     * 分析给定的文档和位置，返回补全上下文
     */
    analyze(document: TextDocument, position: Position): CompletionContext {
        const lineText = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
        });

        const linePrefix = lineText.substring(0, position.character);
        const currentWord = this.extractCurrentWord(linePrefix);
        const previousWord = this.extractPreviousWord(linePrefix, position.character);

        return {
            document,
            position,
            lineText,
            currentWord,
            previousWord,
            linePrefix,
            isInQuotes: this.isInQuotes(linePrefix),
            isInComment: this.isInComment(lineText, position.character),
            lineNumber: position.line
        };
    }

    /**
     * 提取当前单词
     */
    private extractCurrentWord(linePrefix: string): string {
        const match = linePrefix.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
        return match ? match[0] : '';
    }

    /**
     * 提取前一个单词
     */
    private extractPreviousWord(linePrefix: string, position: number): string {
        const beforeCursor = linePrefix.substring(0, position);
        const words = beforeCursor.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
        return words && words.length > 1 ? words[words.length - 2] : '';
    }

    /**
     * 检查是否在引号内
     */
    private isInQuotes(linePrefix: string): boolean {
        const singleQuotes = (linePrefix.match(/'/g) || []).length;
        const doubleQuotes = (linePrefix.match(/"/g) || []).length;

        // 单引号字符串
        if (singleQuotes % 2 === 1) {
            return true;
        }

        // 双引号字符串（如果支持）
        if (doubleQuotes % 2 === 1) {
            return true;
        }

        return false;
    }

    /**
     * 检查是否在注释中
     */
    private isInComment(lineText: string, position: number): boolean {
        // 检查行注释
        const commentIndex = lineText.indexOf(';');
        if (commentIndex !== -1 && commentIndex < position) {
            return true;
        }

        // 检查块注释开始
        const blockCommentStart = lineText.indexOf('/*');
        const blockCommentEnd = lineText.indexOf('*/');

        if (blockCommentStart !== -1 && blockCommentStart < position) {
            if (blockCommentEnd === -1 || blockCommentEnd > position) {
                return true;
            }
        }

        return false;
    }

    /**
     * 判断是否应该提供补全
     */
    shouldProvideCompletion(context: CompletionContext): boolean {
        // 在引号内不提供补全（字符串字面量）
        if (context.isInQuotes) {
            return false;
        }

        // 在注释中不提供补全
        if (context.isInComment) {
            return false;
        }

        // 空行或只有空白字符，提供基本补全
        if (!context.linePrefix.trim()) {
            return true;
        }

        // 检查是否在合法的标识符位置
        const lastChar = context.linePrefix[context.linePrefix.length - 1];
        return /[a-zA-Z0-9_\.]/.test(lastChar) || /\s/.test(lastChar);
    }

    /**
     * 获取补全触发字符
     */
    getTriggerCharacters(context: CompletionContext): string[] {
        const triggers: string[] = [];

        // 基本触发字符
        if (!context.currentWord) {
            triggers.push('.', ' ');
        }

        // 根据上下文添加特定触发字符
        if (context.previousWord === 'UseModule') {
            triggers.push('');
        }

        if (context.linePrefix.trim() === '') {
            triggers.push('');
        }

        return triggers;
    }
}