import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;

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
            documentSelector: [{ scheme: 'file', language: 'purebasic' }],
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

        // Add startup status listener
        client.onReady().then(() => {
            console.log('PureBasic Language Server is ready!');
            vscode.window.showInformationMessage('PureBasic Language Server is ready!');
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

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}