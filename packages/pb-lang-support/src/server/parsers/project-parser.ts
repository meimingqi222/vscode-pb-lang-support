/**
 * PureBasic Project File Parser
 * 解析.pbp项目文件，提取文件引用和配置信息
 * 支持PureBasic 6.21+的XML格式
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export interface ProjectFile {
    name: string;
    version: string;
    author: string;
    sourceFiles: string[];
    includeFiles: string[];
    libraries: string[];
    buildSettings: BuildSettings;
    filePath: string;
    directory: string;
}

export interface BuildSettings {
    executable: string;
    target: string;
    enableDebugger: boolean;
    enableUnicode: boolean;
    enableThreads: boolean;
    enableOnError: boolean;
    enablePurifier: boolean;
    enableConstantFolding: boolean;
    enableInlineASM: boolean;
    enableExplicit: boolean;
    enableOptimizer: boolean;
    subsystem: string;
    commandLine: string;
}

export interface ParsedProject {
    project: ProjectFile;
    includedSymbols: Map<string, any>;
    fileDependencies: Map<string, string[]>;
}

/**
 * 解析.pbp项目文件 (XML格式)
 */
export function parseProjectFile(document: TextDocument): ParsedProject | null {
    try {
        const content = document.getText();

        // 创建项目对象
        const project: ProjectFile = {
            name: '',
            version: '1.0.0',
            author: '',
            sourceFiles: [],
            includeFiles: [],
            libraries: [],
            buildSettings: {
                executable: '',
                target: 'Windows',
                enableDebugger: false,
                enableUnicode: false,
                enableThreads: false,
                enableOnError: false,
                enablePurifier: false,
                enableConstantFolding: false,
                enableInlineASM: false,
                enableExplicit: false,
                enableOptimizer: false,
                subsystem: 'Console',
                commandLine: ''
            },
            filePath: document.uri,
            directory: getProjectDirectory(document.uri)
        };

        // 解析XML格式
        parseXMLProject(content, project);

        // 解析包含文件中的符号
        const includedSymbols = new Map<string, any>();
        const fileDependencies = new Map<string, string[]>();

        return {
            project,
            includedSymbols,
            fileDependencies
        };

    } catch (error) {
        // 在语言服务器中避免直接使用console，应该通过connection记录
        return null;
    }
}

/**
 * 解析XML格式的项目文件
 */
function parseXMLProject(content: string, project: ProjectFile): void {
    try {
        // 简单的XML解析，不依赖完整的XML解析器
        const lines = content.split('\n');
        let currentSection = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 解析section开始
            const sectionMatch = line.match(/<section name="([^"]+)">/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                continue;
            }

            // 解析section结束
            if (line === '</section>') {
                currentSection = '';
                continue;
            }

            // 根据不同section解析内容
            switch (currentSection) {
                case 'config':
                    parseConfigSection(line, project);
                    break;
                case 'data':
                    parseDataSection(line, project);
                    break;
                case 'files':
                    parseFilesSection(line, project);
                    break;
                case 'targets':
                    parseTargetsSection(lines, i, project);
                    break;
            }
        }
    } catch (error) {
        // XML解析失败，尝试旧的INI格式作为备选
        parseINIProject(content, project);
    }
}

/**
 * 解析config section
 */
function parseConfigSection(line: string, project: ProjectFile): void {
    const keyMatch = line.match(/<key name="([^"]+)">\s*(.*?)\s*<\/key>/);
    if (keyMatch) {
        const key = keyMatch[1];
        const value = keyMatch[2];

        switch (key) {
            case 'Name':
                project.name = value;
                break;
            case 'Version':
                project.version = value;
                break;
            case 'Author':
                project.author = value;
                break;
        }
    }
}

/**
 * 解析data section
 */
function parseDataSection(line: string, project: ProjectFile): void {
    const keyMatch = line.match(/<key name="([^"]+)">\s*(.*?)\s*<\/key>/);
    if (keyMatch) {
        const key = keyMatch[1];
        const value = keyMatch[2];

        switch (key) {
            case 'CommandLine':
                project.buildSettings.commandLine = value;
                break;
            case 'Executable':
                project.buildSettings.executable = value;
                break;
            case 'Subsystem':
                project.buildSettings.subsystem = value;
                break;
        }
    }
}

/**
 * 解析files section
 */
function parseFilesSection(line: string, project: ProjectFile): void {
    const fileMatch = line.match(/<file name="([^"]+)"\s*\/?>/);
    if (fileMatch) {
        const fileName = fileMatch[1];
        const resolvedPath = resolveProjectPath(fileName, project.directory);

        if (fileName.endsWith('.pb')) {
            project.sourceFiles.push(resolvedPath);
        } else if (fileName.endsWith('.pbi')) {
            project.includeFiles.push(resolvedPath);
        }
    }
}

/**
 * 解析targets section
 */
function parseTargetsSection(lines: string[], currentIndex: number, project: ProjectFile): void {
    // 查找当前target的开始
    for (let i = currentIndex; i < lines.length; i++) {
        const line = lines[i].trim();

        // 检查是否是target开始
        const targetMatch = line.match(/<target name="([^"]+)" enabled="([^"]+)">/);
        if (targetMatch) {
            const targetName = targetMatch[1];
            const enabled = targetMatch[2] === 'true';

            if (enabled && targetName === 'Default') {
                // 解析target配置
                parseTargetConfig(lines, i + 1, project);
            }
        }

        // 检查是否是target结束
        if (line === '</target>') {
            break;
        }
    }
}

/**
 * 解析target配置
 */
function parseTargetConfig(lines: string[], startIndex: number, project: ProjectFile): void {
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line === '</target>') {
            break;
        }

        const keyMatch = line.match(/<key name="([^"]+)">\s*(.*?)\s*<\/key>/);
        if (keyMatch) {
            const key = keyMatch[1];
            const value = keyMatch[2];

            switch (key) {
                case 'Target':
                    project.buildSettings.target = value;
                    break;
                case 'EnableDebugger':
                    project.buildSettings.enableDebugger = value === 'true';
                    break;
                case 'EnableUnicode':
                    project.buildSettings.enableUnicode = value === 'true';
                    break;
                case 'EnableThreads':
                    project.buildSettings.enableThreads = value === 'true';
                    break;
                case 'EnableOnError':
                    project.buildSettings.enableOnError = value === 'true';
                    break;
                case 'EnablePurifier':
                    project.buildSettings.enablePurifier = value === 'true';
                    break;
                case 'EnableConstantFolding':
                    project.buildSettings.enableConstantFolding = value === 'true';
                    break;
                case 'EnableInlineASM':
                    project.buildSettings.enableInlineASM = value === 'true';
                    break;
                case 'EnableExplicit':
                    project.buildSettings.enableExplicit = value === 'true';
                    break;
                case 'EnableOptimizer':
                    project.buildSettings.enableOptimizer = value === 'true';
                    break;
            }
        }
    }
}

/**
 * 解析INI格式的项目文件 (备选方案)
 */
function parseINIProject(content: string, project: ProjectFile): void {
    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        // 跳过空行和注释
        if (!trimmedLine || trimmedLine.startsWith(';')) {
            continue;
        }

        // 检查节标题
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
            currentSection = trimmedLine.substring(1, trimmedLine.length - 1);
            continue;
        }

        // 解析键值对
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            const value = trimmedLine.substring(equalIndex + 1).trim();

            parseINIProjectProperty(project, currentSection, key, value);
        }
    }
}

/**
 * 解析INI格式的项目属性
 */
function parseINIProjectProperty(project: ProjectFile, section: string, key: string, value: string): void {
    switch (section) {
        case 'Project':
            switch (key) {
                case 'Name':
                    project.name = value;
                    break;
                case 'Version':
                    project.version = value;
                    break;
                case 'Author':
                    project.author = value;
                    break;
            }
            break;

        case 'Files':
            if (key.startsWith('Source')) {
                const filePath = resolveProjectPath(value, project.directory);
                if (filePath.endsWith('.pb')) {
                    project.sourceFiles.push(filePath);
                } else if (filePath.endsWith('.pbi')) {
                    project.includeFiles.push(filePath);
                }
            }
            break;

        case 'Build':
            switch (key) {
                case 'Executable':
                    project.buildSettings.executable = value;
                    break;
                case 'Target':
                    project.buildSettings.target = value;
                    break;
                case 'EnableDebugger':
                    project.buildSettings.enableDebugger = value === '1';
                    break;
                case 'EnableUnicode':
                    project.buildSettings.enableUnicode = value === '1';
                    break;
                case 'EnableThreads':
                    project.buildSettings.enableThreads = value === '1';
                    break;
                case 'EnableOnError':
                    project.buildSettings.enableOnError = value === '1';
                    break;
                case 'EnablePurifier':
                    project.buildSettings.enablePurifier = value === '1';
                    break;
                case 'EnableConstantFolding':
                    project.buildSettings.enableConstantFolding = value === '1';
                    break;
                case 'EnableInlineASM':
                    project.buildSettings.enableInlineASM = value === '1';
                    break;
                case 'EnableExplicit':
                    project.buildSettings.enableExplicit = value === '1';
                    break;
                case 'EnableOptimizer':
                    project.buildSettings.enableOptimizer = value === '1';
                    break;
            }
            break;

        case 'Libraries':
            if (key.startsWith('Library')) {
                project.libraries.push(value);
            }
            break;

        case 'Compiler':
            switch (key) {
                case 'Subsystem':
                    project.buildSettings.subsystem = value;
                    break;
                case 'CommandLine':
                    project.buildSettings.commandLine = value;
                    break;
            }
            break;
    }
}

// 原来的INI解析函数已经被新的XML解析器替代

/**
 * 获取项目文件目录
 */
function getProjectDirectory(uri: string): string {
    const parsedUri = URI.parse(uri);
    return parsedUri.toString().substring(0, parsedUri.toString().lastIndexOf('/') + 1);
}

/**
 * 解析项目路径
 */
function resolveProjectPath(filePath: string, projectDirectory: string): string {
    if (filePath.startsWith('./') || filePath.startsWith('.\\')) {
        filePath = filePath.substring(2);
    }

    if (filePath.includes('/') || filePath.includes('\\')) {
        // 相对路径，需要基于项目目录解析
        // 这里简化处理，实际可能需要更复杂的路径解析
        return filePath;
    }

    return filePath;
}

/**
 * 检查文件是否是项目文件
 */
export function isProjectFile(document: TextDocument): boolean {
    const uri = URI.parse(document.uri);
    return uri.fsPath.endsWith('.pbp');
}

/**
 * 从项目文件中提取所有相关文件路径
 */
export function extractProjectFiles(project: ProjectFile): string[] {
    return [
        ...project.sourceFiles,
        ...project.includeFiles
    ];
}

/**
 * 获取项目的包含目录
 */
export function getProjectIncludeDirectories(project: ProjectFile): string[] {
    const directories = new Set<string>();

    // 添加项目文件所在目录
    directories.add(project.directory);

    // 从包含文件路径中提取目录
    for (const includeFile of project.includeFiles) {
        const lastSlash = includeFile.lastIndexOf('/');
        if (lastSlash > 0) {
            directories.add(includeFile.substring(0, lastSlash + 1));
        }
    }

    return Array.from(directories);
}