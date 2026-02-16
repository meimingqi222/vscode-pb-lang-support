/**
 * 文档相关类型定义
 */

import { Position, Range, TextDocument } from 'vscode-languageserver-textdocument';

/** 文档包装器接口 */
export interface DocumentWrapper {
    /** 文档URI */
    uri: string;
    /** 获取文档内容 */
    getText(range?: Range): string;
    /** 获取位置 */
    getPosition(offset: number): Position;
    /** 获取偏移量 */
    getOffset(position: Position): number;
    /** 行数 */
    lineCount: number;
    /** 语言ID */
    languageId: string;
    /** 版本号 */
    version: number;
}

/** 文档缓存接口 */
export interface DocumentCache {
    /** 获取文档 */
    get(uri: string): DocumentWrapper | undefined;
    /** 设置文档 */
    set(uri: string, document: DocumentWrapper): void;
    /** 检查是否存在 */
    has(uri: string): boolean;
    /** 删除文档 */
    delete(uri: string): boolean;
    /** 清空缓存 */
    clear(): void;
    /** 获取所有文档URI */
    keys(): string[];
    /** 获取缓存大小 */
    size: number;
}

/** 文档版本信息 */
export interface DocumentVersion {
    /** 文档URI */
    uri: string;
    /** 版本号 */
    version: number;
    /** 最后修改时间 */
    lastModified: number;
}

/** 文档解析状态 */
export enum DocumentParseStatus {
    /** 未解析 */
    NotParsed = 'not-parsed',
    /** 解析中 */
    Parsing = 'parsing',
    /** 解析完成 */
    Parsed = 'parsed',
    /** 解析失败 */
    Failed = 'failed'
}

/** 文档解析信息 */
export interface DocumentParseInfo {
    /** 状态 */
    status: DocumentParseStatus;
    /** 解析时间（毫秒） */
    parseTime?: number;
    /** 错误信息 */
    error?: string;
    /** 符号数量 */
    symbolCount?: number;
    /** 最后解析时间 */
    lastParsed?: number;
}

/** 文档变更信息 */
export interface DocumentChange {
    /** 文档URI */
    uri: string;
    /** 旧版本 */
    oldVersion?: number;
    /** 新版本 */
    newVersion: number;
    /** 变更范围 */
    changes: Range[];
    /** 变更时间 */
    timestamp: number;
}