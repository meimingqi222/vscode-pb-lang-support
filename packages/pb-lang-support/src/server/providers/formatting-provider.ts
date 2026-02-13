/**
 * 代码格式化提供者
 * 为PureBasic提供代码格式化功能
 */

import {
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
    TextEdit,
    Range,
    Position
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * 格式化设置
 */
export interface FormattingOptions {
    /** 缩进大小 */
    tabSize: number;
    /** 是否使用空格而不是制表符 */
    insertSpaces: boolean;
    /** 在关键字后添加空格（当前未启用） */
    spaceAfterKeywords: boolean;
    /** 在操作符周围添加空格（当前未启用） */
    spaceAroundOperators: boolean;
    /** 自动格式化过程体（当前未启用具体逻辑） */
    formatProcedureBody: boolean;
}

const DEFAULT_OPTIONS: FormattingOptions = {
    tabSize: 4,
    insertSpaces: true,
    // 为避免破坏指针语法、比较运算符等，默认关闭以下两项，保守只做缩进
    spaceAfterKeywords: false,
    spaceAroundOperators: false,
    formatProcedureBody: true
};

/**
 * 处理文档格式化
 */
export function handleDocumentFormatting(
    params: DocumentFormattingParams,
    document: TextDocument
): TextEdit[] {
    const text = document.getText();
    const fullRange = Range.create(
        Position.create(0, 0),
        document.positionAt(text.length)
    );

    const options = mergeOptions(params.options);
    const formattedText = formatPureBasicCode(text, options);

    if (formattedText === text) {
        return [];
    }

    return [TextEdit.replace(fullRange, formattedText)];
}

/**
 * 处理范围格式化
 */
export function handleDocumentRangeFormatting(
    params: DocumentRangeFormattingParams,
    document: TextDocument
): TextEdit[] {
    const text = document.getText();
    const range = params.range;

    const options = mergeOptions(params.options);

    // 扩展范围到完整行
    const expandedRange = expandToFullLines(document, range);
    const expandedText = document.getText(expandedRange);

    // 计算起始缩进上下文：从文档开头扫描到选区起始行之前
    const linesBefore = text.split('\n').slice(0, expandedRange.start.line);
    const initialState = computeInitialFormatterState(linesBefore);

    const formattedText = formatPureBasicCode(expandedText, options, initialState);

    if (formattedText === expandedText) {
        return [];
    }

    return [TextEdit.replace(expandedRange, formattedText)];
}

/**
 * 格式化PureBasic代码（只做缩进调整，不动行内代码）
 */
function formatPureBasicCode(text: string, options: FormattingOptions, initialState?: FormatterState): string {
    const lines = text.split('\n');
    const out: string[] = [];

    // 块级缩进状态
    let indentLevel = initialState?.indentLevel ?? 0;
    let inSelect = initialState?.inSelect ?? false;
    let selectBaseIndent = initialState?.selectBaseIndent ?? 0;
    let caseActive = initialState?.caseActive ?? false;

    const isClosing = (l: string): boolean => /^(EndProcedure|EndModule|EndStructure|EndIf|Next|Wend|Until|ForEver|EndWith|EndDeclareModule|EndInterface|EndEnumeration|EndMacro|EndDataSection|CompilerEndIf|CompilerEndSelect)\b/i.test(l);
    const isOpening = (l: string): boolean => /^(Procedure(?:C|DLL|CDLL)?\b|Module\b|Structure\b|If\b|For\b|ForEach\b|While\b|Repeat\b|With\b|DeclareModule\b|Interface\b|Enumeration\b|Macro\b|DataSection\b|CompilerIf\b|CompilerSelect\b)/i.test(l);
    const isEndSelect = (l: string): boolean => /^EndSelect\b/i.test(l);
    const isSelect = (l: string): boolean => /^Select\b/i.test(l);
    const isCase = (l: string): boolean => /^(Case\b|Default\b)/i.test(l);
    const isMiddle = (l: string): boolean => /^(Else\b|ElseIf\b|CompilerElse\b|CompilerElseIf\b)/i.test(l);

    // 行内起止净零判定（在剥离字符串与注释后进行）
    const hasInlineNetZero = (code: string): boolean => {
        const contains = (re: RegExp) => re.test(code);
        return (
            (contains(/\bIf\b/i) && contains(/\bEndIf\b/i)) ||
            ((contains(/\bFor\b/i) || contains(/\bForEach\b/i)) && contains(/\bNext\b/i)) ||
            (contains(/\bWhile\b/i) && contains(/\bWend\b/i)) ||
            (contains(/\bRepeat\b/i) && (contains(/\bUntil\b/i) || contains(/\bForEver\b/i))) ||
            (contains(/\bSelect\b/i) && contains(/\bEndSelect\b/i)) ||
            (contains(/\bWith\b/i) && contains(/\bEndWith\b/i)) ||
            (contains(/\bProcedure(?:C|DLL|CDLL)?\b/i) && contains(/\bEndProcedure\b/i)) ||
            (contains(/\bModule\b/i) && contains(/\bEndModule\b/i)) ||
            (contains(/\bDeclareModule\b/i) && contains(/\bEndDeclareModule\b/i)) ||
            (contains(/\bStructure\b/i) && contains(/\bEndStructure\b/i)) ||
            (contains(/\bInterface\b/i) && contains(/\bEndInterface\b/i)) ||
            (contains(/\bEnumeration\b/i) && contains(/\bEndEnumeration\b/i)) ||
            (contains(/\bMacro\b/i) && contains(/\bEndMacro\b/i)) ||
            (contains(/\bDataSection\b/i) && contains(/\bEndDataSection\b/i)) ||
            (contains(/\bCompilerIf\b/i) && contains(/\bCompilerEndIf\b/i)) ||
            (contains(/\bCompilerSelect\b/i) && contains(/\bCompilerEndSelect\b/i))
        );
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();
        const code = stripStringsAndComments(raw).trim();

        // 空行：保持为空
        if (trimmed === '') { out.push(''); continue; }

        // 注释行：按当前缩进输出
        if (trimmed.startsWith(';')) {
            const indent = createIndent(Math.max(0, indentLevel), options);
            out.push(indent + trimmed);
            continue;
        }

        let lineIndent = indentLevel;

        // 单行 If ... : ... : EndIf 模式：不改变缩进层级
        const inlineIf = /^If\b/i.test(code) && /\bEndIf\b/i.test(code);
        const inlineAny = hasInlineNetZero(code);

        // 专门处理 EndSelect（在 Select 基础缩进处渲染）
        if (!inlineAny && isEndSelect(code)) {
            lineIndent = Math.max(0, indentLevel);
            if (inSelect) {
                lineIndent = Math.max(0, selectBaseIndent);
                indentLevel = selectBaseIndent;
                inSelect = false;
                caseActive = false;
            } else {
                // 非法情况下，按一般收尾处理
                lineIndent = Math.max(0, indentLevel - 1);
                indentLevel = lineIndent;
            }
        } else if (!inlineAny && isSelect(code)) {
            // Select 行本身使用当前缩进，随后进入选择块
            lineIndent = indentLevel;
        } else if (!inlineAny && inSelect && isCase(code)) {
            // Case/Default 行：位于 Select 内 +1 级
            lineIndent = selectBaseIndent + 1;
        } else {
            // 关闭语句在当前行生效：先减缩进
            if (!inlineAny && isClosing(code)) {
                lineIndent = Math.max(0, indentLevel - 1);
                indentLevel = lineIndent; // 后续行同级
            }
        }

        // 中间语句（Else/ElseIf）：回退一级再保持层级（先减后加，净零变化）
        let restoreAfter = false;
        if (!inlineAny && !isSelect(code) && !isEndSelect(code) && isMiddle(code)) {
            lineIndent = Math.max(0, lineIndent - 1);
            indentLevel = lineIndent;
            restoreAfter = true;
        }

        // 仅做缩进，不改动行内内容（避免破坏 *ptr、<=、<> 等）
        const indent = createIndent(Math.max(0, lineIndent), options);
        out.push(indent + trimmed);

        // 行后处理
        if (inlineAny) {
            // 同行净零：不改变缩进状态，不进入/退出任何块
        } else if (isSelect(code)) {
            // 进入 Select 块：Case 行期望在 +1，Case 内容在 +2
            inSelect = true;
            selectBaseIndent = lineIndent;
            caseActive = false;
            indentLevel = selectBaseIndent + 1; // 以便 Case 出现时对齐
        } else if (!inlineIf && inSelect && isCase(code)) {
            // 选中某个 Case：其后的内容进入 +2
            caseActive = true;
            indentLevel = selectBaseIndent + 2;
        } else if (!inlineAny && isOpening(code)) {
            indentLevel++;
        }
        if (!inlineAny && restoreAfter) {
            indentLevel++;
        }

        // 若在 Select 块内、尚未遇到 Case，则保持期待下一个 Case 的缩进级别
        if (!inlineAny && inSelect && !caseActive && !isEndSelect(code) && !isCase(code) && !isSelect(code)) {
            indentLevel = Math.max(indentLevel, selectBaseIndent + 1);
        }
    }

    return out.join('\n');
}

/**
 * 缩进状态（用于范围格式化）
 */
interface FormatterState {
    indentLevel: number;
    inSelect: boolean;
    selectBaseIndent: number;
    caseActive: boolean;
}

/**
 * 计算某行之前的缩进上下文（用于范围格式化的起始状态）
 */
function computeInitialFormatterState(linesBefore: string[]): FormatterState {
    // 复用与 formatPureBasicCode 相同的判断逻辑
    const isClosing = (l: string): boolean => /^(EndProcedure|EndModule|EndStructure|EndIf|Next|Wend|Until|ForEver|EndWith|EndDeclareModule|EndInterface|EndEnumeration)\b/i.test(l);
    const isOpening = (l: string): boolean => /^(Procedure(?:C|DLL|CDLL)?\b|Module\b|Structure\b|If\b|For\b|ForEach\b|While\b|Repeat\b|With\b|DeclareModule\b|Interface\b|Enumeration\b)/i.test(l);
    const isEndSelect = (l: string): boolean => /^EndSelect\b/i.test(l);
    const isSelect = (l: string): boolean => /^Select\b/i.test(l);
    const isCase = (l: string): boolean => /^(Case\b|Default\b)/i.test(l);
    const isMiddle = (l: string): boolean => /^(Else\b|ElseIf\b)/i.test(l);

    const hasInlineNetZero = (code: string): boolean => {
        const contains = (re: RegExp) => re.test(code);
        return (
            (contains(/\bIf\b/i) && contains(/\bEndIf\b/i)) ||
            ((contains(/\bFor\b/i) || contains(/\bForEach\b/i)) && contains(/\bNext\b/i)) ||
            (contains(/\bWhile\b/i) && contains(/\bWend\b/i)) ||
            (contains(/\bRepeat\b/i) && (contains(/\bUntil\b/i) || contains(/\bForEver\b/i))) ||
            (contains(/\bSelect\b/i) && contains(/\bEndSelect\b/i)) ||
            (contains(/\bWith\b/i) && contains(/\bEndWith\b/i)) ||
            (contains(/\bProcedure(?:C|DLL|CDLL)?\b/i) && contains(/\bEndProcedure\b/i)) ||
            (contains(/\bModule\b/i) && contains(/\bEndModule\b/i)) ||
            (contains(/\bDeclareModule\b/i) && contains(/\bEndDeclareModule\b/i)) ||
            (contains(/\bStructure\b/i) && contains(/\bEndStructure\b/i)) ||
            (contains(/\bInterface\b/i) && contains(/\bEndInterface\b/i)) ||
            (contains(/\bEnumeration\b/i) && contains(/\bEndEnumeration\b/i))
        );
    };

    let indentLevel = 0;
    let inSelect = false;
    let selectBaseIndent = 0;
    let caseActive = false;

    for (let i = 0; i < linesBefore.length; i++) {
        const raw = linesBefore[i];
        const trimmed = raw.trim();
        const code = stripStringsAndComments(raw).trim();
        if (trimmed === '' || trimmed.startsWith(';')) continue;

        const inlineAny = hasInlineNetZero(code);

        if (!inlineAny && isEndSelect(code)) {
            if (inSelect) {
                indentLevel = Math.max(0, selectBaseIndent);
                inSelect = false;
                caseActive = false;
            } else {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        } else if (!inlineAny && isSelect(code)) {
            // 进入 Select 块
            selectBaseIndent = indentLevel;
            inSelect = true;
            caseActive = false;
            indentLevel = selectBaseIndent + 1;
        } else {
            if (!inlineAny && isClosing(code)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        }

        // 处理中间语句 Else/ElseIf：净零，不改变最终 indentLevel
        if (inlineAny) {
            // 不改变状态
        } else if (isSelect(code)) {
            // 已处理
        } else if (!inlineAny && inSelect && isCase(code)) {
            // 选中某 Case：其后进入 +2 级
            indentLevel = selectBaseIndent + 2;
        } else if (!inlineAny && isOpening(code)) {
            indentLevel++;
        }

        if (!inlineAny && inSelect && !caseActive && !isEndSelect(code) && !isCase(code) && !isSelect(code)) {
            indentLevel = Math.max(indentLevel, selectBaseIndent + 1);
        }
    }

    return { indentLevel, inSelect, selectBaseIndent, caseActive };
}

/**
 * 去除字符串与行尾注释，返回用于匹配关键字的纯代码部分
 */
function stripStringsAndComments(line: string): string {
    let out = '';
    let inDq = false;
    let inSq = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (!inDq && !inSq && ch === ';') {
            // 行注释开始
            break;
        }
        if (!inSq && ch === '"') {
            inDq = !inDq;
            continue; // 跳过字符串内容
        }
        if (!inDq && ch === '\'') {
            inSq = !inSq;
            continue; // 跳过字符串内容
        }
        if (!inDq && !inSq) {
            out += ch;
        }
    }
    return out;
}

/**
 * 计算缩进级别（保留，暂未使用）
 */
function calculateIndentLevel(
    line: string,
    inProcedure: boolean,
    inModule: boolean,
    inStructure: boolean
): number {
    let level = 0;

    if (inProcedure) level++;
    if (inModule) level++;
    if (inStructure) level++;

    return level;
}

/**
 * 更新格式化状态（保留，暂未使用）
 */
function updateFormattingState(
    line: string,
    inProcedure: boolean,
    inModule: boolean,
    inStructure: boolean,
    currentIndent: number
): {
    newInProcedure: boolean;
    newInModule: boolean;
    newInStructure: boolean;
    lineIndent: number;
} {
    const lower = line.toLowerCase();
    let newIndent = currentIndent;

    // 检查结构结束
    if (lower.match(/^endprocedure\b/)) {
        return {
            newInProcedure: false,
            newInModule: inModule,
            newInStructure: inStructure,
            lineIndent: Math.max(0, currentIndent - 1)
        };
    }

    if (lower.match(/^endmodule\b/)) {
        return {
            newInProcedure: inProcedure,
            newInModule: false,
            newInStructure: inStructure,
            lineIndent: Math.max(0, currentIndent - 1)
        };
    }

    if (lower.match(/^endstructure\b/)) {
        return {
            newInProcedure: inProcedure,
            newInModule: inModule,
            newInStructure: false,
            lineIndent: Math.max(0, currentIndent - 1)
        };
    }

    // 检查控制结构结束
    if (lower.match(/^(endif|next|wend|until|forever|endselect|endwith)\b/)) {
        newIndent = Math.max(0, currentIndent - 1);
    }

    // 检查结构开始
    let newInProcedure = inProcedure;
    let newInModule = inModule;
    let newInStructure = inStructure;

    if (lower.match(/^procedure(?:c|dll|cdll)?\b/)) {
        newInProcedure = true;
        newIndent = currentIndent;
    } else if (lower.match(/^module\b/)) {
        newInModule = true;
        newIndent = currentIndent;
    } else if (lower.match(/^structure\b/)) {
        newInStructure = true;
        newIndent = currentIndent;
    }

    // 检查控制结构开始
    else if (lower.match(/^(if|for|foreach|while|repeat|select|with)\b/)) {
        newIndent = currentIndent;
    }

    return {
        newInProcedure,
        newInModule,
        newInStructure,
        lineIndent: newIndent
    };
}

/**
 * 创建缩进字符串
 */
function createIndent(level: number, options: FormattingOptions): string {
    const indentChar = options.insertSpaces ? ' ' : '\t';
    const indentSize = options.insertSpaces ? options.tabSize : 1;
    return indentChar.repeat(level * indentSize);
}

/**
 * 扩展范围到完整行
 */
function expandToFullLines(document: TextDocument, range: Range): Range {
    const startLine = range.start.line;
    const endLine = range.end.line;

    return Range.create(
        Position.create(startLine, 0),
        Position.create(endLine, document.getText(
            Range.create(Position.create(endLine, 0), Position.create(endLine + 1, 0))
        ).length)
    );
}

/**
 * 合并格式化选项
 */
function mergeOptions(options: any): FormattingOptions {
    return {
        tabSize: options?.tabSize ?? DEFAULT_OPTIONS.tabSize,
        insertSpaces: options?.insertSpaces ?? DEFAULT_OPTIONS.insertSpaces,
        spaceAfterKeywords: options?.spaceAfterKeywords ?? DEFAULT_OPTIONS.spaceAfterKeywords,
        spaceAroundOperators: options?.spaceAroundOperators ?? DEFAULT_OPTIONS.spaceAroundOperators,
        formatProcedureBody: options?.formatProcedureBody ?? DEFAULT_OPTIONS.formatProcedureBody
    };
}
