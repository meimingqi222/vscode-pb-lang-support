import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;
let debugChannel: vscode.OutputChannel;

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
                { scheme: 'file', language: 'purebasic' },
                { scheme: 'file', language: 'purebasic-project' }
            ],
            synchronize: {
                configurationSection: 'purebasic',
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{pb,pbi,pbp}')
            }
        };

        client = new LanguageClient(
            'purebasic',
            'PureBasic Language Server',
            serverOptions,
            clientOptions
        );

        // Register commands
        registerCommands(context);

        // Add startup status listener
        client.onReady().then(() => {
            console.log('PureBasic Language Server is ready!');
            vscode.window.showInformationMessage('PureBasic Language Server is ready!');

            // Setup debug output channel
            debugChannel = vscode.window.createOutputChannel('PureBasic (Debug)');
            debugChannel.appendLine('PureBasic debug channel initialized.');
        }).catch(error => {
            console.error('Language Server failed to start:', error);
            vscode.window.showErrorMessage('PureBasic Language Server failed to start: ' + error.message);
        });

        console.log('Starting Language Server...');
        client.start();
        console.log('Language Server start command sent');

    } catch (error) {
        console.error('Error activating extension:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage('Failed to activate PureBasic extension: ' + errorMessage);
    }
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
        if (editor && (editor.document.languageId === 'purebasic' || editor.document.languageId === 'purebasic-project')) {
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
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
