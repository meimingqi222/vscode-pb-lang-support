/**
 * PureBasic Language Server
 * 模块化架构的Language Server实现
 */

import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    DocumentSymbolParams,
    HoverParams,
    Hover,
    DefinitionParams,
    Location,
    ReferenceParams,
    PrepareRenameParams,
    RenameParams,
    WorkspaceEdit,
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
    TextEdit
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// 导入配置
import { serverCapabilities } from './config/capabilities';
import { defaultSettings, globalSettings, PureBasicSettings } from './config/settings';

// 导入验证器
import { validateDocument } from './validation/validator';

// 导入代码补全提供者
import { handleCompletion, handleCompletionResolve } from './providers/completion-provider';

// 导入定义和引用提供者
import { handleDefinition } from './providers/definition-provider';
import { handleReferences } from './providers/reference-provider';

// 导入签名帮助提供者
import { handleSignatureHelp } from './providers/signature-provider';

// 导入悬停和文档符号提供者
import { handleHover } from './providers/hover-provider';
import { handleDocumentSymbol } from './providers/document-symbol-provider';

// 导入重命名提供者
import { handlePrepareRename, handleRename } from './providers/rename-provider';

// 导入格式化提供者
import { handleDocumentFormatting, handleDocumentRangeFormatting } from './providers/formatting-provider';

// 导入符号管理
import { parseDocumentSymbols } from './symbols/symbol-manager';
import { setWorkspaceRoots } from './indexer/workspace-index';
import { symbolCache } from './symbols/symbol-cache';
import { SymbolInformation, SymbolKind as LSPSymbolKind, WorkspaceSymbolParams } from 'vscode-languageserver/node';
import { SymbolKind as PBSymbolKind, PureBasicSymbol } from './symbols/types';

// 导入工具函数
import { debounce } from './utils/debounce-utils';
import { generateHash } from './utils/hash-utils';

// 导入错误处理
import { initializeErrorHandler } from './utils/error-handler';

// 导入项目管理器
import { ProjectManager } from './managers/project-manager';

// 创建连接
const connection = createConnection(ProposedFeatures.all);

// 初始化错误处理器
const errorHandler = initializeErrorHandler(connection);

// 创建文档管理器
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// 文档设置缓存
const documentSettings: Map<string, Thenable<PureBasicSettings>> = new Map();
const documentHashes: Map<string, string> = new Map();

// 文档缓存，用于定义跳转和引用查找
const documentCache: Map<string, TextDocument> = new Map();

// 项目管理器，用于处理.pbp项目文件
let projectManager: ProjectManager;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // 检查客户端能力
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    // 初始化项目管理器
    projectManager = new ProjectManager(connection);

    const result: InitializeResult = {
        capabilities: serverCapabilities
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    return result;
});

connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
        // 注册配置变更
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(async _event => {
            try {
                const folders = await connection.workspace.getWorkspaceFolders();
                const uris = (folders || []).map(f => f.uri);
                setWorkspaceRoots(uris);
            } catch {}
        });
        // 初始化工作区根
        connection.workspace.getWorkspaceFolders().then(folders => {
            const uris = (folders || []).map(f => f.uri);
            setWorkspaceRoots(uris);
        }).catch(() => {});
    }
});

// 自定义请求：清空符号缓存（与客户端命令 purebasic.clearSymbolCache 配合）
connection.onRequest('purebasic/clearSymbolCache', () => {
    try {
        symbolCache.clearAll();
        connection.console.log('PureBasic: symbol cache cleared by client request');
        return true;
    } catch (err) {
        connection.console.error(`Failed to clear symbol cache: ${err}`);
        return false;
    }
});

// 配置变更处理
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // 清除缓存的文档设置
        documentSettings.clear();
    } else {
        globalSettings.maxNumberOfProblems = (change.settings.purebasic || defaultSettings).maxNumberOfProblems;
        globalSettings.enableValidation = (change.settings.purebasic || defaultSettings).enableValidation;
        globalSettings.enableCompletion = (change.settings.purebasic || defaultSettings).enableCompletion;
        globalSettings.validationDelay = (change.settings.purebasic || defaultSettings).validationDelay;
    }

    // 重新验证所有打开的文档
    documents.all().forEach(safeValidateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<PureBasicSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }

    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'purebasic'
        }).then(config => {
            // 确保返回完整的设置对象，使用默认值填补缺失的属性
            return {
                maxNumberOfProblems: config?.maxNumberOfProblems ?? defaultSettings.maxNumberOfProblems,
                enableValidation: config?.enableValidation ?? defaultSettings.enableValidation,
                enableCompletion: config?.enableCompletion ?? defaultSettings.enableCompletion,
                validationDelay: config?.validationDelay ?? defaultSettings.validationDelay,
                formatting: config?.formatting ?? defaultSettings.formatting,
                completion: config?.completion ?? defaultSettings.completion,
                linting: config?.linting ?? defaultSettings.linting,
                symbols: config?.symbols ?? defaultSettings.symbols
            };
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// 文档变更处理
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    documentHashes.delete(e.document.uri);
    documentCache.delete(e.document.uri);
    // 通知项目管理器
    projectManager.onDocumentClose(e.document);
});

documents.onDidOpen(e => {
    documentCache.set(e.document.uri, e.document);
    // 通知项目管理器
    projectManager.onDocumentOpen(e.document);
});

documents.onDidChangeContent(change => {
    documentCache.set(change.document.uri, change.document);
    // 通知项目管理器
    projectManager.onDocumentChange(change.document);
    debouncedValidateTextDocument(change.document);
});

// 防抖验证函数
const debouncedValidateTextDocument = debounce((textDocument: TextDocument) => {
    safeValidateTextDocument(textDocument);
}, 500);

const safeValidateTextDocument = (textDocument: TextDocument): Promise<void> => {
    return errorHandler.handleAsync('text-document-validation', async () => {
    const settings = await getDocumentSettings(textDocument.uri);

    if (!settings || !settings.enableValidation) {
        return;
    }

    // 跳过.pbp项目文件的语法验证（它们是XML格式，不是PureBasic代码）
    if (textDocument.uri.endsWith('.pbp')) {
        return;
    }

    const text = textDocument.getText();
    const newHash = generateHash(text);
    const oldHash = documentHashes.get(textDocument.uri);

    // 如果内容没有变化，跳过验证
    if (oldHash === newHash) {
        return;
    }

    documentHashes.set(textDocument.uri, newHash);

    // 解析符号
    parseDocumentSymbols(textDocument.uri, text);

    // 验证文档
    let diagnostics = validateDocument(text);

    // 限制诊断数量
    if (diagnostics.length > settings.maxNumberOfProblems) {
        diagnostics = diagnostics.slice(0, settings.maxNumberOfProblems);
    }

    // 发送诊断
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
};

// 代码补全处理
connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[] | null> => {
    return errorHandler.handleAsync('completion-handler', async () => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const settings = await getDocumentSettings(params.textDocument.uri);
        if (!settings.enableCompletion) {
            return null;
        }

        const completionResult = handleCompletion(params, document, documentCache);
        return completionResult.items;
    }, { fallbackValue: null });
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return handleCompletionResolve(item);
});

// 文档符号处理
connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    try {
        return handleDocumentSymbol(params, document);
    } catch (error) {
        connection.console.error(`Document symbol error: ${error}`);
        return [];
    }
});

// 悬停信息处理
connection.onHover((params: HoverParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    try {
        return handleHover(params, document, documentCache);
    } catch (error) {
        connection.console.error(`Hover error: ${error}`);
        return null;
    }
});

// 定义跳转处理
connection.onDefinition((params: DefinitionParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    try {
        return handleDefinition(params, document, documentCache, projectManager);
    } catch (error) {
        connection.console.error(`Definition error: ${error}`);
        return [];
    }
});

// 查找引用处理
connection.onReferences((params: ReferenceParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    try {
        return handleReferences(params, document, documentCache);
    } catch (error) {
        connection.console.error(`References error: ${error}`);
        return [];
    }
});

// 文档高亮处理
connection.onDocumentHighlight((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    // 返回空数组作为基础实现，避免错误
    return [];
});

// 工作区符号处理（基于符号缓存的快速搜索）
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    const query = (params.query || '').trim();
    if (!query) return [];
    const results = symbolCache.findSymbolDetailed(query);
    // 去重并限制数量
    const max = 200;
    const out: SymbolInformation[] = [];
    for (const { uri, symbol: sym } of results) {
        out.push({
            name: sym.name,
            kind: mapSymbolKind(sym.kind),
            location: { uri, range: sym.range }
        });
        if (out.length >= max) break;
    }
    return out;
});

function mapSymbolKind(kind: PBSymbolKind): LSPSymbolKind {
    switch (kind) {
        case PBSymbolKind.Procedure: return LSPSymbolKind.Function;
        case PBSymbolKind.Variable: return LSPSymbolKind.Variable;
        case PBSymbolKind.Constant: return LSPSymbolKind.Constant;
        case PBSymbolKind.Structure: return LSPSymbolKind.Struct;
        case PBSymbolKind.Module: return LSPSymbolKind.Module;
        case PBSymbolKind.Interface: return LSPSymbolKind.Interface;
        case PBSymbolKind.Enumeration: return LSPSymbolKind.Enum;
        default: return LSPSymbolKind.Object;
    }
}

// findUriForSymbol 不再需要，使用 symbolCache.findSymbolDetailed 提供的URI

// 签名帮助处理
connection.onSignatureHelp((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    try {
        return handleSignatureHelp(params, document, documentCache);
    } catch (error) {
        connection.console.error(`Signature help error: ${error}`);
        return null;
    }
});

// 重命名准备处理
connection.onPrepareRename((params: PrepareRenameParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    try {
        return handlePrepareRename(params, document, documentCache);
    } catch (error) {
        connection.console.error(`Prepare rename error: ${error}`);
        return null;
    }
});

// 重命名处理
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    try {
        return handleRename(params, document, documentCache);
    } catch (error) {
        connection.console.error(`Rename error: ${error}`);
        return null;
    }
});

// 文档格式化处理
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    try {
        return handleDocumentFormatting(params, document);
    } catch (error) {
        connection.console.error(`Document formatting error: ${error}`);
        return [];
    }
});

// 范围格式化处理
connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams): TextEdit[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    try {
        return handleDocumentRangeFormatting(params, document);
    } catch (error) {
        connection.console.error(`Range formatting error: ${error}`);
        return [];
    }
});

// 诊断相关处理已集成在validateTextDocument函数中

// 使documents监听连接
documents.listen(connection);

// 监听连接
connection.listen();
