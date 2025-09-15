/**
 * PureBasic Project Manager
 * 管理项目文件和跨文件符号解析
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { Connection } from 'vscode-languageserver/node';
import {
    parseProjectFile,
    ProjectFile,
    ParsedProject,
    isProjectFile,
    extractProjectFiles,
    getProjectIncludeDirectories
} from '../parsers/project-parser';

export interface ProjectContext {
    projectFile: string;
    project: ProjectFile;
    includedFiles: Map<string, TextDocument>;
    globalSymbols: Map<string, any>;
    lastModified: number;
}

export class ProjectManager {
    private projects: Map<string, ProjectContext> = new Map();
    private fileToProject: Map<string, string> = new Map();
    private workspaceRoot: string = '';
    private connection: Connection;

    constructor(connection: Connection, workspaceRoot: string = '') {
        this.connection = connection;
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * 设置工作区根目录
     */
    public setWorkspaceRoot(root: string): void {
        this.workspaceRoot = root;
    }

    /**
     * 处理文档打开事件
     */
    public onDocumentOpen(document: TextDocument): void {
        if (isProjectFile(document)) {
            this.loadProject(document);
        } else {
            this.associateFileWithProject(document);
        }
    }

    /**
     * 处理文档关闭事件
     */
    public onDocumentClose(document: TextDocument): void {
        const uri = document.uri;

        // 如果是项目文件，卸载项目
        if (isProjectFile(document)) {
            this.unloadProject(uri);
        } else {
            // 从项目的包含文件中移除
            this.removeFileFromProjects(uri);
        }
    }

    /**
     * 处理文档内容变更
     */
    public onDocumentChange(document: TextDocument): void {
        if (isProjectFile(document)) {
            // 项目文件变更，重新加载
            this.reloadProject(document);
        } else {
            // 普通文件变更，更新相关项目的符号
            this.updateProjectSymbols(document);
        }
    }

    /**
     * 加载项目文件
     */
    private loadProject(document: TextDocument): void {
        const uri = document.uri;
        const parsedProject = parseProjectFile(document);

        if (!parsedProject) {
            this.connection.console.error(`Failed to parse project file: ${uri}`);
            return;
        }

        const projectContext: ProjectContext = {
            projectFile: uri,
            project: parsedProject.project,
            includedFiles: new Map(),
            globalSymbols: new Map(),
            lastModified: Date.now()
        };

        this.projects.set(uri, projectContext);

        // 解析项目中的包含文件
        this.parseProjectIncludes(projectContext);

        this.connection.console.log(`Loaded project: ${parsedProject.project.name} (${uri})`);
    }

    /**
     * 重新加载项目文件
     */
    private reloadProject(document: TextDocument): void {
        const uri = document.uri;
        const existingProject = this.projects.get(uri);

        if (existingProject) {
            this.unloadProject(uri);
        }

        this.loadProject(document);
    }

    /**
     * 卸载项目
     */
    private unloadProject(uri: string): void {
        const project = this.projects.get(uri);
        if (project) {
            // 清理文件到项目的映射
            for (const [fileUri, projectUri] of this.fileToProject) {
                if (projectUri === uri) {
                    this.fileToProject.delete(fileUri);
                }
            }

            this.projects.delete(uri);
            this.connection.console.log(`Unloaded project: ${uri}`);
        }
    }

    /**
     * 将文件关联到项目
     */
    private associateFileWithProject(document: TextDocument): void {
        const uri = document.uri;
        const filePath = URI.parse(uri).fsPath;

        // 查找包含此文件的项目
        for (const [projectUri, project] of this.projects) {
            const projectFiles = extractProjectFiles(project.project);

            if (projectFiles.some(file => filePath.includes(file) || file.includes(filePath))) {
                this.fileToProject.set(uri, projectUri);
                project.includedFiles.set(uri, document);

                // 解析文件符号并添加到项目全局符号表
                this.parseFileSymbols(document, project.globalSymbols);
                break;
            }
        }
    }

    /**
     * 从项目中移除文件
     */
    private removeFileFromProjects(uri: string): void {
        const projectUri = this.fileToProject.get(uri);
        if (projectUri) {
            const project = this.projects.get(projectUri);
            if (project) {
                project.includedFiles.delete(uri);
                this.fileToProject.delete(uri);

                // 从全局符号中移除该文件的符号
                this.removeFileSymbols(uri, project.globalSymbols);
            }
        }
    }

    /**
     * 解析项目包含文件
     */
    private async parseProjectIncludes(project: ProjectContext): Promise<void> {
        const includeDirectories = getProjectIncludeDirectories(project.project);

        // 这里应该实现异步文件读取，但由于在language server中，
        // 我们需要通过workspace功能来读取文件
        // 暂时留空，等待具体的文件读取实现
    }

    /**
     * 解析文件符号
     */
    private parseFileSymbols(document: TextDocument, globalSymbols: Map<string, any>): void {
        const content = document.getText();
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 解析过程定义
            if (line.startsWith('Procedure') || line.startsWith('Procedure.')) {
                const match = line.match(/(?:Procedure|Procedure\.\w+)\s+(\w+)\s*\(/);
                if (match) {
                    const procName = match[1];
                    globalSymbols.set(procName, {
                        type: 'procedure',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }

            // 解析变量声明
            if (line.startsWith('Global') || line.startsWith('Define')) {
                const match = line.match(/(?:Global|Define)\s+(\w+)/);
                if (match) {
                    const varName = match[1];
                    globalSymbols.set(varName, {
                        type: 'variable',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }

            // 解析常量定义
            if (line.startsWith('#')) {
                const match = line.match(/#\s*(\w+)\s*=/);
                if (match) {
                    const constName = match[1];
                    globalSymbols.set(constName, {
                        type: 'constant',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }

            // 解析结构定义
            if (line.startsWith('Structure')) {
                const match = line.match(/Structure\s+(\w+)/);
                if (match) {
                    const structName = match[1];
                    globalSymbols.set(structName, {
                        type: 'structure',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }

            // 解析接口定义
            if (line.startsWith('Interface')) {
                const match = line.match(/Interface\s+(\w+)/);
                if (match) {
                    const interfaceName = match[1];
                    globalSymbols.set(interfaceName, {
                        type: 'interface',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }

            // 解析枚举定义
            if (line.startsWith('Enumeration')) {
                const match = line.match(/Enumeration\s+(\w+)/);
                if (match) {
                    const enumName = match[1];
                    globalSymbols.set(enumName, {
                        type: 'enumeration',
                        file: document.uri,
                        line: i,
                        definition: line
                    });
                }
            }
        }
    }

    /**
     * 从全局符号中移除文件符号
     */
    private removeFileSymbols(uri: string, globalSymbols: Map<string, any>): void {
        for (const [symbolName, symbol] of globalSymbols) {
            if (symbol.file === uri) {
                globalSymbols.delete(symbolName);
            }
        }
    }

    /**
     * 更新项目符号
     */
    private updateProjectSymbols(document: TextDocument): void {
        const projectUri = this.fileToProject.get(document.uri);
        if (projectUri) {
            const project = this.projects.get(projectUri);
            if (project) {
                // 移除旧的符号
                this.removeFileSymbols(document.uri, project.globalSymbols);

                // 添加新的符号
                this.parseFileSymbols(document, project.globalSymbols);

                project.lastModified = Date.now();
            }
        }
    }

    /**
     * 获取文件所属项目
     */
    public getFileProject(uri: string): ProjectContext | null {
        const projectUri = this.fileToProject.get(uri);
        return projectUri ? this.projects.get(projectUri) || null : null;
    }

    /**
     * 获取项目的全局符号
     */
    public getProjectSymbols(uri: string): Map<string, any> | null {
        const project = this.getFileProject(uri);
        return project ? project.globalSymbols : null;
    }

    /**
     * 查找符号定义
     */
    public findSymbolDefinition(symbolName: string, uri: string): any | null {
        const symbols = this.getProjectSymbols(uri);
        if (symbols) {
            return symbols.get(symbolName) || null;
        }
        return null;
    }

    /**
     * 获取所有项目
     */
    public getAllProjects(): ProjectContext[] {
        return Array.from(this.projects.values());
    }

    /**
     * 获取项目文件路径列表
     */
    public getProjectFiles(): string[] {
        return Array.from(this.projects.keys());
    }

    /**
     * 检查文件是否属于某个项目
     */
    public isFileInProject(uri: string): boolean {
        return this.fileToProject.has(uri);
    }
}