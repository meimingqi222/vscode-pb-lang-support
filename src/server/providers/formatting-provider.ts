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
    /** 在关键字后添加空格 */
    spaceAfterKeywords: boolean;
    /** 在操作符周围添加空格 */
    spaceAroundOperators: boolean;
    /** 自动格式化过程体 */
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
    const selectedText = document.getText(range);

    const options = mergeOptions(params.options);

    // 扩展范围到完整行
    const expandedRange = expandToFullLines(document, range);
    const expandedText = document.getText(expandedRange);

    const formattedText = formatPureBasicCode(expandedText, options);

    if (formattedText === expandedText) {
        return [];
    }

    return [TextEdit.replace(expandedRange, formattedText)];
}

/**
 * 格式化PureBasic代码
 */
function formatPureBasicCode(text: string, options: FormattingOptions): string {
    const lines = text.split('\n');
    const out: string[] = [];

    // 块级缩进：仅根据结构化关键字计算缩进，不改动运算符/指针等代码内容
    let indentLevel = 0;
    // Select/Case 块管理
    let inSelect = false;
    let selectBaseIndent = 0;
    let caseActive = false;

    const isClosing = (l: string): boolean => /^(EndProcedure|EndModule|EndStructure|EndIf|Next|Wend|Until|EndWith|EndDeclareModule|EndInterface|EndEnumeration)\b/i.test(l);
    const isOpening = (l: string): boolean => /^(Procedure\b|Module\b|Structure\b|If\b|For\b|ForEach\b|While\b|Repeat\b|With\b|DeclareModule\b|Interface\b|Enumeration\b)/i.test(l);
    const isEndSelect = (l: string): boolean => /^EndSelect\b/i.test(l);
    const isSelect = (l: string): boolean => /^Select\b/i.test(l);
    const isCase = (l: string): boolean => /^(Case\b|Default\b)/i.test(l);
    // 中间语句：Else/ElseIf 保持与 If 同级
    const isMiddle = (l: string): boolean => /^(Else\b|ElseIf\b)/i.test(l);

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();

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
        const inlineIf = /^If\b/i.test(trimmed) && /\bEndIf\b/i.test(trimmed);

        // 专门处理 EndSelect（在 Select 基础缩进处渲染）
        if (!inlineIf && isEndSelect(trimmed)) {
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
        } else if (!inlineIf && isSelect(trimmed)) {
            // Select 行本身使用当前缩进，随后进入选择块
            lineIndent = indentLevel;
        } else if (!inlineIf && inSelect && isCase(trimmed)) {
            // Case/Default 行：位于 Select 内 +1 级
            lineIndent = selectBaseIndent + 1;
        } else {
            // 关闭语句在当前行生效：先减缩进
            if (!inlineIf && isClosing(trimmed)) {
                lineIndent = Math.max(0, indentLevel - 1);
                indentLevel = lineIndent; // 后续行同级
            }
        }

        // 中间语句（Else/ElseIf）：回退一级再保持层级（先减后加，净零变化）
        let restoreAfter = false;
        if (!inlineIf && !isSelect(trimmed) && !isEndSelect(trimmed) && isMiddle(trimmed)) {
            lineIndent = Math.max(0, lineIndent - 1);
            indentLevel = lineIndent;
            restoreAfter = true;
        }

        // 仅做缩进，不改动行内内容（避免破坏 *ptr、<=、<> 等）
        let formattedLine = formatLine(trimmed, {
            ...options,
            spaceAfterKeywords: false,
            spaceAroundOperators: false
        });

        const indent = createIndent(Math.max(0, lineIndent), options);
        out.push(indent + formattedLine);

        // 行后处理
        if (!inlineIf && isSelect(trimmed)) {
            // 进入 Select 块：Case 行期望在 +1，Case 内容在 +2
            inSelect = true;
            selectBaseIndent = lineIndent;
            caseActive = false;
            indentLevel = selectBaseIndent + 1; // 以便 Case 出现时对齐
        } else if (!inlineIf && inSelect && isCase(trimmed)) {
            // 选中某个 Case：其后的内容进入 +2
            caseActive = true;
            indentLevel = selectBaseIndent + 2;
        } else if (!inlineIf && isOpening(trimmed)) {
            indentLevel++;
        }
        if (!inlineIf && restoreAfter) {
            indentLevel++;
        }

        // 若在 Select 块内、尚未遇到 Case，则保持期待下一个 Case 的缩进级别
        if (!inlineIf && inSelect && !caseActive && !isEndSelect(trimmed) && !isCase(trimmed) && !isSelect(trimmed)) {
            indentLevel = Math.max(indentLevel, selectBaseIndent + 1);
        }
    }

    return out.join('\n');
}

/**
 * 计算缩进级别
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
 * 更新格式化状态
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
    if (lower.match(/^(endif|next|wend|until|endselect|endwith)\b/)) {
        newIndent = Math.max(0, currentIndent - 1);
    }

    // 检查结构开始
    let newInProcedure = inProcedure;
    let newInModule = inModule;
    let newInStructure = inStructure;

    if (lower.match(/^procedure\b/)) {
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
 * 格式化单行代码
 */
function formatLine(line: string, options: FormattingOptions): string {
    // 保守模式：不改动行内 token，仅去除行首/行尾多余空白由调用方处理
    // 如需更激进的格式化，应在确保不破坏语义的前提下按 token 进行解析
    return line;
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
