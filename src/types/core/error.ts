/**
 * 错误处理相关类型定义
 */

import { Position } from 'vscode-languageserver-textdocument';

/** 错误上下文信息 */
export interface ErrorContext {
    /** 操作名称 */
    operation: string;
    /** 文档URI */
    documentUri?: string;
    /** 位置信息 */
    position?: Position;
    /** 附加信息 */
    additional?: Record<string, unknown>;
    /** 组件名称 */
    component?: string;
    /** 用户标识 */
    userId?: string;
}

/** 错误处理选项 */
export interface ErrorHandlerOptions {
    /** 是否记录到控制台 */
    logToConsole: boolean;
    /** 是否显示给用户 */
    showToUser: boolean;
    /** 回退值 */
    fallbackValue?: unknown;
    /** 是否重新抛出错误 */
    rethrow?: boolean;
    /** 最大重试次数 */
    maxRetries?: number;
    /** 重试延迟（毫秒） */
    retryDelay?: number;
    /** 错误回调 */
    onError?: (error: Error, context: ErrorContext) => void;
}

/** 错误统计信息 */
export interface ErrorStats {
    /** 总错误数 */
    totalErrors: number;
    /** 按操作分类的错误数 */
    errorsByOperation: Record<string, number>;
    /** 按组件分类的错误数 */
    errorsByComponent: Record<string, number>;
    /** 最后错误时间 */
    lastErrorTime?: number;
    /** 最常见错误 */
    mostCommonError?: { message: string; count: number };
}

/** 函数类型定义 */
export type AsyncFunction<T = unknown> = (...args: unknown[]) => Promise<T>;
export type SyncFunction<T = unknown> = (...args: unknown[]) => T;

/** 装饰器目标类型 */
export interface DecoratorTarget {
    /** 构造函数 */
    constructor: Function;
    /** 原型 */
    prototype: Record<string, unknown>;
}

/** 方法描述符类型 */
export interface MethodDescriptor<T> {
    /** 可写性 */
    writable?: boolean;
    /** 可枚举性 */
    enumerable?: boolean;
    /** 可配置性 */
    configurable?: boolean;
    /** 值 */
    value?: T;
    /** Get方法 */
    get?: () => T;
    /** Set方法 */
    set?: (value: T) => void;
}

/** 带类型的属性描述符 */
export interface TypedPropertyDescriptor<T> extends PropertyDescriptor {
    /** 值 */
    value?: T;
    /** Get方法 */
    get?: () => T;
    /** Set方法 */
    set?: (value: T) => void;
}

/** 错误处理装饰器选项 */
export interface ErrorDecoratorOptions extends ErrorHandlerOptions {
    /** 是否禁用该装饰器 */
    disabled?: boolean;
    /** 错误类型白名单 */
    allowedErrorTypes?: string[];
    /** 错误消息黑名单 */
    blockedErrorMessages?: string[];
}

/** 重试配置 */
export interface RetryConfig {
    /** 最大重试次数 */
    maxAttempts: number;
    /** 基础延迟（毫秒） */
    baseDelay: number;
    /** 最大延迟（毫秒） */
    maxDelay: number;
    /** 退避因子 */
    backoffFactor: number;
    /** 抖动因子 */
    jitter: boolean;
}

/** 错误过滤器 */
export type ErrorFilter = (error: Error) => boolean;

/** 错误处理器 */
export type ErrorHandler = (error: Error, context: ErrorContext) => void | Promise<void>;