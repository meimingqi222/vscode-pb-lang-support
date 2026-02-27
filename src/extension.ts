import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;
let debugChannel: vscode.OutputChannel;
let fileWatcher: vscode.FileSystemWatcher;

export function activate(context: vscode.ExtensionContext) {
    console.log('PureBasic extension is now active!');

    try {
        const serverPath = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
        console.log('Server path:', serverPath);

        // Check if server file exists
        const fs = require('fs');
        if (!fs.existsSync(serverPath)) {
            console.error('Server file does not exist:', serverPath);
            vscode.window.showErrorMessage('PureBasic Language Server file not found!');
            return;
        }

        const serverOptions: ServerOptions = {
            run: {
                module: serverPath,
                transport: TransportKind.stdio
            },
            debug: {
                module: serverPath,
                transport: TransportKind.stdio,
                options: { execArgv: ['--nolazy', '--inspect=6009'] }
            }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'purebasic' }
            ],
            synchronize: {
                configurationSection: 'purebasic',
                fileEvents: fileWatcher
            }
        };

        // Create file watcher and store reference for cleanup
        fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{pb,pbi,pbp}');
        context.subscriptions.push(fileWatcher);

        client = new LanguageClient(
            'purebasic',
            'PureBasic Language Server',
            serverOptions,
            clientOptions
        );

        // Register commands
        registerCommands(context);

        // Register debug configuration provider
        registerDebugProvider(context);

        // Add startup status listener
        console.log('Starting Language Server...');
        client.start().then(() => {
            console.log('PureBasic Language Server is ready!');
            vscode.window.showInformationMessage('PureBasic Language Server is ready!');

            // Setup debug output channel
            debugChannel = vscode.window.createOutputChannel('PureBasic (Debug)');
            debugChannel.appendLine('PureBasic debug channel initialized.');
        }).catch((error: any) => {
            console.error('Language Server failed to start:', error);
            vscode.window.showErrorMessage('PureBasic Language Server failed to start: ' + error.message);
        });

    } catch (error) {
        console.error('Error activating extension:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to activate PureBasic extension: ' + errorMessage);
    }
}

function registerDebugProvider(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('purebasic', {
            resolveDebugConfiguration(
                _folder: vscode.WorkspaceFolder | undefined,
                config: vscode.DebugConfiguration,
            ): vscode.ProviderResult<vscode.DebugConfiguration> {
                // If launched via F5 with no launch.json, supply defaults
                if (!config.type && !config.request && !config.name) {
                    const editor = vscode.window.activeTextEditor;
                    if (editor && editor.document.languageId === 'purebasic') {
                        config.type        = 'purebasic';
                        config.name        = 'Debug PureBasic';
                        config.request     = 'launch';
                        config.program     = editor.document.fileName;
                        config.stopOnEntry = false;
                    }
                }
                if (!config.program) {
                    return vscode.window.showInformationMessage(
                        'Cannot find a PureBasic file to debug. Open a .pb file first.',
                    ).then(() => undefined);
                }
                return config;
            },
        }),
    );
}

function registerCommands(context: vscode.ExtensionContext) {
    // Show diagnostics command
    const showDiagnostics = vscode.commands.registerCommand('purebasic.showDiagnostics', () => {
        vscode.commands.executeCommand('workbench.action.problems.focus');
    });

    // Restart language server command
    const restartLanguageServer = vscode.commands.registerCommand('purebasic.restartLanguageServer', async () => {
        if (client) {
            try {
                await client.stop();
                await client.start();
                vscode.window.showInformationMessage('PureBasic Language Server restarted successfully!');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to restart PureBasic Language Server: ' + (error instanceof Error ? error.message : String(error)));
            }
        }
    });

    // Clear symbol cache command
    const clearSymbolCache = vscode.commands.registerCommand('purebasic.clearSymbolCache', async () => {
        try {
            if (client) {
                await client.sendRequest('purebasic/clearSymbolCache');
                vscode.window.showInformationMessage('Symbol cache cleared successfully!');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clear symbol cache: ' + (error instanceof Error ? error.message : String(error)));
        }
    });

    // Format document command
    const formatDocument = vscode.commands.registerCommand('purebasic.formatDocument', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'purebasic') {
            try {
                await vscode.commands.executeCommand('editor.action.formatDocument');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to format document: ' + (error instanceof Error ? error.message : String(error)));
            }
        } else {
            vscode.window.showWarningMessage('No PureBasic document active');
        }
    });

    // Find symbols command
    const findSymbols = vscode.commands.registerCommand('purebasic.findSymbols', async () => {
        try {
            await vscode.commands.executeCommand('workbench.action.showAllSymbols');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to show symbols: ' + (error instanceof Error ? error.message : String(error)));
        }
    });

    // Register all commands
    context.subscriptions.push(
        showDiagnostics,
        restartLanguageServer,
        clearSymbolCache,
        formatDocument,
        findSymbols
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function deactivate(): Thenable<void> | undefined {
    // Dispose file watcher
    if (fileWatcher) {
        fileWatcher.dispose();
        fileWatcher = undefined as any;
    }

    if (!client) {
        return undefined;
    }
    return client.stop();
}
