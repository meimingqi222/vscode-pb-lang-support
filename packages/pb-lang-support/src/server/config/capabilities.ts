/**
 * Language Server 能力配置
 */

import {
    TextDocumentSyncKind,
    CompletionOptions,
    ServerCapabilities
} from 'vscode-languageserver/node';

/**
 * 服务器能力配置
 */
export const serverCapabilities: ServerCapabilities = {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', '(', '#', ':', '\\']
    },
    definitionProvider: true,
    referencesProvider: true,
    documentHighlightProvider: true,
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    hoverProvider: true,
    signatureHelpProvider: {
        triggerCharacters: ['(', ',']
    },
    renameProvider: {
        prepareProvider: true
    },
    documentFormattingProvider: true,
    documentRangeFormattingProvider: true
};
