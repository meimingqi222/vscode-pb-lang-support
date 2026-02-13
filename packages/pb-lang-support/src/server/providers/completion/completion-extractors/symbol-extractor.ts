/**
 * 符号提取器
 * 从文档中提取各种类型的符号
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { PureBasicSymbol, SymbolKind } from '../../../symbols/types';
import { CompletionExtractor, CompletionContext } from '../completion-types';
import { symbolCache } from '../../../symbols/symbol-cache';

/**
 * 文档符号提取器
 */
export class DocumentSymbolExtractor implements CompletionExtractor {
    name = 'document-symbol';

    supports(context: CompletionContext): boolean {
        // 在文档上下文中总是支持
        return !context.isInComment && !context.isInQuotes;
    }

    async extract(context: CompletionContext): Promise<PureBasicSymbol[]> {
        // 从缓存获取符号
        const cachedSymbols = symbolCache.getSymbols(context.document.uri);
        if (cachedSymbols && cachedSymbols.length > 0) {
            return this.filterSymbols(cachedSymbols, context);
        }

        // 如果缓存中没有，返回空数组（符号将在后台解析）
        return [];
    }

    /**
     * 根据上下文过滤符号
     */
    private filterSymbols(symbols: PureBasicSymbol[], context: CompletionContext): PureBasicSymbol[] {
        const { currentWord, previousWord, linePrefix } = context;

        return symbols.filter(symbol => {
            // 基于当前单词过滤
            if (currentWord && !symbol.name.toLowerCase().includes(currentWord.toLowerCase())) {
                return false;
            }

            // 特殊的上下文过滤
            if (previousWord === 'UseModule' && symbol.kind !== SymbolKind.Module) {
                return false;
            }

            // 过滤掉不合适的符号类型
            if (this.shouldFilterSymbol(symbol, context)) {
                return false;
            }

            return true;
        });
    }

    /**
     * 判断是否应该过滤掉某个符号
     */
    private shouldFilterSymbol(symbol: PureBasicSymbol, context: CompletionContext): boolean {
        const { linePrefix } = context;

        // 在UseModule语句中只显示模块
        if (linePrefix.trim().toLowerCase().startsWith('usemodule')) {
            return symbol.kind !== SymbolKind.Module;
        }

        // 在点号后只显示成员
        if (linePrefix.includes('.')) {
            const prefix = linePrefix.substring(0, linePrefix.lastIndexOf('.'));
            // 如果前缀是结构体名称，显示结构体成员
            // 如果前缀是模块名称，显示模块成员
            // 这里需要更复杂的逻辑来判断上下文
        }

        return false;
    }
}

/**
 * 内置函数符号提取器
 */
export class BuiltinSymbolExtractor implements CompletionExtractor {
    name = 'builtin-symbol';

    // 内置PureBasic函数和关键字
    private builtinSymbols = [
        { name: 'If', kind: SymbolKind.Keyword, documentation: '条件语句' },
        { name: 'Else', kind: SymbolKind.Keyword, documentation: '否则分支' },
        { name: 'ElseIf', kind: SymbolKind.Keyword, documentation: '否则如果分支' },
        { name: 'EndIf', kind: SymbolKind.Keyword, documentation: '结束条件语句' },
        { name: 'For', kind: SymbolKind.Keyword, documentation: 'For循环' },
        { name: 'Next', kind: SymbolKind.Keyword, documentation: 'Next循环' },
        { name: 'While', kind: SymbolKind.Keyword, documentation: 'While循环' },
        { name: 'Wend', kind: SymbolKind.Keyword, documentation: '结束While循环' },
        { name: 'Repeat', kind: SymbolKind.Keyword, documentation: 'Repeat循环' },
        { name: 'Until', kind: SymbolKind.Keyword, documentation: 'Until条件' },
        { name: 'Select', kind: SymbolKind.Keyword, documentation: 'Select语句' },
        { name: 'Case', kind: SymbolKind.Keyword, documentation: 'Case分支' },
        { name: 'Default', kind: SymbolKind.Keyword, documentation: '默认分支' },
        { name: 'EndSelect', kind: SymbolKind.Keyword, documentation: '结束Select语句' },
        { name: 'Procedure', kind: SymbolKind.Keyword, documentation: '定义过程' },
        { name: 'EndProcedure', kind: SymbolKind.Keyword, documentation: '结束过程' },
        { name: 'ProcedureReturn', kind: SymbolKind.Keyword, documentation: '过程返回' },
        { name: 'Declare', kind: SymbolKind.Keyword, documentation: '声明外部函数' },
        { name: 'Prototype', kind: SymbolKind.Keyword, documentation: '函数原型' },
        { name: 'Structure', kind: SymbolKind.Keyword, documentation: '定义结构体' },
        { name: 'EndStructure', kind: SymbolKind.Keyword, documentation: '结束结构体' },
        { name: 'Interface', kind: SymbolKind.Keyword, documentation: '定义接口' },
        { name: 'EndInterface', kind: SymbolKind.Keyword, documentation: '结束接口' },
        { name: 'Enumeration', kind: SymbolKind.Keyword, documentation: '定义枚举' },
        { name: 'EndEnumeration', kind: SymbolKind.Keyword, documentation: '结束枚举' },
        { name: 'DeclareModule', kind: SymbolKind.Keyword, documentation: '声明模块' },
        { name: 'EndDeclareModule', kind: SymbolKind.Keyword, documentation: '结束模块声明' },
        { name: 'Module', kind: SymbolKind.Keyword, documentation: '定义模块' },
        { name: 'EndModule', kind: SymbolKind.Keyword, documentation: '结束模块' },
        { name: 'UseModule', kind: SymbolKind.Keyword, documentation: '使用模块' },
        { name: 'UnuseModule', kind: SymbolKind.Keyword, documentation: '取消使用模块' },

        // 数据类型
        { name: '.l', kind: SymbolKind.Keyword, documentation: '长整型' },
        { name: '.i', kind: SymbolKind.Keyword, documentation: '整型' },
        { name: '.s', kind: SymbolKind.Keyword, documentation: '字符串' },
        { name: '.f', kind: SymbolKind.Keyword, documentation: '浮点型' },
        { name: '.d', kind: SymbolKind.Keyword, documentation: '双精度浮点型' },
        { name: '.b', kind: SymbolKind.Keyword, documentation: '字节型' },
        { name: '.w', kind: SymbolKind.Keyword, documentation: '字型' },
        { name: '.q', kind: SymbolKind.Keyword, documentation: '四字型' },
        { name: '.u', kind: SymbolKind.Keyword, documentation: '无符号整型' },

        // 常用内置函数
        { name: 'OpenFile', kind: SymbolKind.Function, documentation: '打开文件' },
        { name: 'CloseFile', kind: SymbolKind.Function, documentation: '关闭文件' },
        { name: 'ReadString', kind: SymbolKind.Function, documentation: '读取字符串' },
        { name: 'WriteString', kind: SymbolKind.Function, documentation: '写入字符串' },
        { name: 'Len', kind: SymbolKind.Function, documentation: '获取长度' },
        { name: 'Left', kind: SymbolKind.Function, documentation: '获取左边字符' },
        { name: 'Right', kind: SymbolKind.Function, documentation: '获取右边字符' },
        { name: 'Mid', kind: SymbolKind.Function, documentation: '获取中间字符' },
        { name: 'Trim', kind: SymbolKind.Function, documentation: '去除空白字符' },
        { name: 'LCase', kind: SymbolKind.Function, documentation: '转换为小写' },
        { name: 'UCase', kind: SymbolKind.Function, documentation: '转换为大写' },
        { name: 'Str', kind: SymbolKind.Function, documentation: '数值转字符串' },
        { name: 'Val', kind: SymbolKind.Function, documentation: '字符串转数值' },
        { name: 'Abs', kind: SymbolKind.Function, documentation: '绝对值' },
        { name: 'Min', kind: SymbolKind.Function, documentation: '最小值' },
        { name: 'Max', kind: SymbolKind.Function, documentation: '最大值' },
        { name: 'Sqr', kind: SymbolKind.Function, documentation: '平方根' },
        { name: 'Sin', kind: SymbolKind.Function, documentation: '正弦' },
        { name: 'Cos', kind: SymbolKind.Function, documentation: '余弦' },
        { name: 'Tan', kind: SymbolKind.Function, documentation: '正切' },
        { name: 'ASin', kind: SymbolKind.Function, documentation: '反正弦' },
        { name: 'ACos', kind: SymbolKind.Function, documentation: '反余弦' },
        { name: 'ATan', kind: SymbolKind.Function, documentation: '反正切' },
        { name: 'Random', kind: SymbolKind.Function, documentation: '随机数' },
        { name: 'RandomSeed', kind: SymbolKind.Function, documentation: '设置随机种子' },

        // 内存和数组操作
        { name: 'AllocateMemory', kind: SymbolKind.Function, documentation: '分配内存' },
        { name: 'FreeMemory', kind: SymbolKind.Function, documentation: '释放内存' },
        { name: 'ReAllocateMemory', kind: SymbolKind.Function, documentation: '重新分配内存' },
        { name: 'CopyMemory', kind: SymbolKind.Function, documentation: '复制内存' },
        { name: 'FillMemory', kind: SymbolKind.Function, documentation: '填充内存' },
        { name: 'Dim', kind: SymbolKind.Keyword, documentation: '定义数组' },
        { name: 'ReDim', kind: SymbolKind.Keyword, documentation: '重新定义数组' },
        { name: 'ArraySize', kind: SymbolKind.Function, documentation: '获取数组大小' },

        // 调试和输出
        { name: 'Debug', kind: SymbolKind.Function, documentation: '调试输出' },
        { name: 'Print', kind: SymbolKind.Function, documentation: '打印输出' },
        { name: 'MessageRequester', kind: SymbolKind.Function, documentation: '消息框' }
    ];

    supports(context: CompletionContext): boolean {
        // 内置符号在大多数上下文中都支持
        return !context.isInComment && !context.isInQuotes;
    }

    async extract(context: CompletionContext): Promise<PureBasicSymbol[]> {
        const { currentWord } = context;

        return this.builtinSymbols
            .filter(symbol => {
                if (!currentWord) return true;
                return symbol.name.toLowerCase().includes(currentWord.toLowerCase());
            })
            .map(symbol => ({
                ...symbol,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: symbol.name.length }
                }
            }));
    }
}