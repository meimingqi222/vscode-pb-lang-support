/**
 * PureBasic Language Server
 * Language Server implementation with a modular architecture
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

// Import configuration
import { serverCapabilities } from './config/capabilities';
import { defaultSettings, globalSettings, PureBasicSettings } from './config/settings';

// Import validator
import { validateDocument } from './validation/validator';

// Import code completion provider
import { handleCompletion, handleCompletionResolve } from './providers/completion-provider';

// Import definition and reference providers
import { handleDefinition } from './providers/definition-provider';
import { handleReferences } from './providers/reference-provider';

// Import signature help provider
import { handleSignatureHelp } from './providers/signature-provider';

// Import hover and document symbol providers
import { handleHover } from './providers/hover-provider';
import { handleDocumentSymbol } from './providers/document-symbol-provider';

// Import rename providers
import { handlePrepareRename, handleRename } from './providers/rename-provider';

// Import formatting providers
import { handleDocumentFormatting, handleDocumentRangeFormatting } from './providers/formatting-provider';

// Import symbol management
import { parseDocumentSymbols } from './symbols/symbol-manager';
import { setWorkspaceRoots } from './indexer/workspace-index';
import { symbolCache } from './symbols/symbol-cache';
import { SymbolInformation, SymbolKind as LSPSymbolKind, WorkspaceSymbolParams } from 'vscode-languageserver/node';
import { SymbolKind as PBSymbolKind, PureBasicSymbol } from './symbols/types';

// Import utility functions
import { debounce } from './utils/debounce-utils';
import { generateHash } from './utils/hash-utils';

// Import error handling
import { initializeErrorHandler } from './utils/error-handler';

// Import project manager
import { ProjectManager } from './managers/project-manager';

// Create connection
const connection = createConnection(ProposedFeatures.all);

// Initialize error handler
const errorHandler = initializeErrorHandler(connection);

// Create document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

// Document settings cache
const documentSettings: Map<string, Thenable<PureBasicSettings>> = new Map();
const documentHashes: Map<string, string> = new Map();

// Document cache for defining jumps and reference lookups
const documentCache: Map<string, TextDocument> = new Map();

// Project manager for handling .pbp project files
let projectManager: ProjectManager;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Check client capabilities
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

    // Initialize the Project Manager
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
        // Registration Configuration Change Notification
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
        // Initialize workspace root
        connection.workspace.getWorkspaceFolders().then(folders => {
            const uris = (folders || []).map(f => f.uri);
            setWorkspaceRoots(uris);
        }).catch(() => {});
    }
});

// Custom Request: Clear Symbol Cache (to be used with the client command `purebasic.clearSymbolCache`)
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

// Configuration Change Management
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Clear cached document settings
        documentSettings.clear();
    } else {
        globalSettings.maxNumberOfProblems = (change.settings.purebasic || defaultSettings).maxNumberOfProblems;
        globalSettings.enableValidation = (change.settings.purebasic || defaultSettings).enableValidation;
        globalSettings.enableCompletion = (change.settings.purebasic || defaultSettings).enableCompletion;
        globalSettings.validationDelay = (change.settings.purebasic || defaultSettings).validationDelay;
    }

    // Re-validate all open documents
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
            // Ensure a complete settings object is returned, filling missing properties with defaults
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

// Document change handling
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    documentHashes.delete(e.document.uri);
    documentCache.delete(e.document.uri);
    // Notify project manager
    projectManager.onDocumentClose(e.document);
});

documents.onDidOpen(e => {
    documentCache.set(e.document.uri, e.document);
    // Notify project manager
    projectManager.onDocumentOpen(e.document);
});

documents.onDidChangeContent(change => {
    documentCache.set(change.document.uri, change.document);
    // Notify project manager
    projectManager.onDocumentChange(change.document);
    debouncedValidateTextDocument(change.document);
});

// Debounced validation function
const debouncedValidateTextDocument = debounce((textDocument: TextDocument) => {
    safeValidateTextDocument(textDocument);
}, 500);

const safeValidateTextDocument = (textDocument: TextDocument): Promise<void> => {
    return errorHandler.handleAsync('text-document-validation', async () => {
    const settings = await getDocumentSettings(textDocument.uri);

    if (!settings || !settings.enableValidation) {
        return;
    }

    // Skip syntax validation for .pbp project files (they are XML, not PureBasic code)
    if (textDocument.uri.endsWith('.pbp')) {
        return;
    }

    const text = textDocument.getText();
    const newHash = generateHash(text);
    const oldHash = documentHashes.get(textDocument.uri);

    // Skip validation if content hasn't changed
    if (oldHash === newHash) {
        return;
    }

    documentHashes.set(textDocument.uri, newHash);

    // Parse symbols
    parseDocumentSymbols(textDocument.uri, text);

    // Validate document
    let diagnostics = validateDocument(text);

    // Limit number of diagnostics
    if (diagnostics.length > settings.maxNumberOfProblems) {
        diagnostics = diagnostics.slice(0, settings.maxNumberOfProblems);
    }

    // Send diagnostics
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    });
};

// Completion handling
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

// Document symbol handling
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

// Hover handling
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

// Definition handling
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

// References handling
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

// Document highlight handling
connection.onDocumentHighlight((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    // Return empty array as a basic implementation to avoid errors
    return [];
});

// Workspace symbol handling (fast search based on symbol cache)
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

// findUriForSymbol is no longer needed; use the URI provided by symbolCache.findSymbolDetailed

// Signature help handling
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

// Prepare rename handling
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

// Rename handling
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

// Document formatting handling
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

// Range formatting handling
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

// Diagnostic-related handling is integrated in the validateTextDocument function

// Start documents listening on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
