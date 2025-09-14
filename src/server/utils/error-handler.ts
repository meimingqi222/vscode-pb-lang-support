/**
 * 统一错误处理工具
 * 提供优雅的错误处理和恢复机制
 */

import { Connection } from 'vscode-languageserver/node';

export enum ErrorLevel {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export interface ErrorContext {
    operation: string;
    documentUri?: string;
    position?: { line: number; character: number };
    additional?: Record<string, any>;
}

export interface ErrorHandlerOptions {
    logToConsole: boolean;
    showToUser: boolean;
    fallbackValue?: any;
    rethrow?: boolean;
}

export class ErrorHandler {
    private connection: Connection;
    private errorCounts: Map<string, number> = new Map();
    private readonly maxErrorsBeforeDisable = 10;
    private disabledFeatures: Set<string> = new Set();

    constructor(connection: Connection) {
        this.connection = connection;
    }

    /**
     * 处理错误并返回降级结果
     */
    public async handleAsync<T>(
        operation: string,
        fn: () => Promise<T>,
        options: Partial<ErrorHandlerOptions> = {}
    ): Promise<T> {
        const opts: ErrorHandlerOptions = {
            logToConsole: true,
            showToUser: false,
            rethrow: false,
            ...options
        };

        try {
            return await fn();
        } catch (error) {
            this.handleError(operation, error, {}, opts);

            if (opts.rethrow) {
                throw error;
            }

            return opts.fallbackValue;
        }
    }

    /**
     * 同步版本的错误处理
     */
    public handleSync<T>(
        operation: string,
        fn: () => T,
        options: Partial<ErrorHandlerOptions> = {}
    ): T {
        const opts: ErrorHandlerOptions = {
            logToConsole: true,
            showToUser: false,
            rethrow: false,
            ...options
        };

        try {
            return fn();
        } catch (error) {
            this.handleError(operation, error, {}, opts);

            if (opts.rethrow) {
                throw error;
            }

            return opts.fallbackValue;
        }
    }

    /**
     * 包装函数以自动处理错误
     */
    public wrapAsync<T>(
        operation: string,
        fn: () => Promise<T>,
        options: Partial<ErrorHandlerOptions> = {}
    ): () => Promise<T> {
        return async () => this.handleAsync(operation, fn, options);
    }

    /**
     * 包装同步函数以自动处理错误
     */
    public wrapSync<T>(
        operation: string,
        fn: () => T,
        options: Partial<ErrorHandlerOptions> = {}
    ): () => T {
        return () => this.handleSync(operation, fn, options);
    }

    /**
     * 检查功能是否被禁用
     */
    public isFeatureDisabled(feature: string): boolean {
        return this.disabledFeatures.has(feature);
    }

    /**
     * 重新启用功能
     */
    public enableFeature(feature: string): void {
        this.disabledFeatures.delete(feature);
        this.errorCounts.delete(feature);
        this.connection.console.log(`Re-enabled feature: ${feature}`);
    }

    /**
     * 获取错误统计信息
     */
    public getErrorStats(): Record<string, number> {
        return Object.fromEntries(this.errorCounts);
    }

    /**
     * 清理错误统计
     */
    public clearErrors(): void {
        this.errorCounts.clear();
        this.disabledFeatures.clear();
    }

    private handleError(
        operation: string,
        error: any,
        context: Partial<ErrorContext> = {},
        options: ErrorHandlerOptions
    ): void {
        const errorKey = `${operation}-${context.documentUri || 'global'}`;
        const errorCount = (this.errorCounts.get(errorKey) || 0) + 1;
        this.errorCounts.set(errorKey, errorCount);

        // 如果错误过多，禁用该功能
        if (errorCount >= this.maxErrorsBeforeDisable) {
            this.disabledFeatures.add(operation);
            this.connection.console.error(
                `Feature "${operation}" disabled due to too many errors (${errorCount}). ` +
                `Restart VSCode to re-enable.`
            );
            return;
        }

        // 构建错误消息
        const errorMessage = this.formatErrorMessage(error, {
            operation,
            ...context,
            additional: {
                errorCount,
                ...context.additional
            }
        });

        // 记录到控制台
        if (options.logToConsole) {
            this.connection.console.error(errorMessage);
        }

        // 显示给用户
        if (options.showToUser) {
            this.connection.window.showErrorMessage(
                `PureBasic Language Server error in ${operation}: ${error.message || error}`
            );
        }
    }

    private formatErrorMessage(
        error: any,
        context: ErrorContext
    ): string {
        const parts: string[] = [];

        parts.push(`[${context.operation}]`);

        if (context.documentUri) {
            parts.push(`Document: ${context.documentUri}`);
        }

        if (context.position) {
            parts.push(`Position: ${context.position.line}:${context.position.character}`);
        }

        parts.push(`Error: ${error.message || error}`);
        parts.push(`Stack: ${error.stack || 'No stack trace'}`);

        if (context.additional) {
            parts.push(`Context: ${JSON.stringify(context.additional)}`);
        }

        return parts.join(' | ');
    }
}

// 创建全局错误处理器实例
let globalErrorHandler: ErrorHandler | null = null;

export function initializeErrorHandler(connection: Connection): ErrorHandler {
    globalErrorHandler = new ErrorHandler(connection);
    return globalErrorHandler;
}

export function getErrorHandler(): ErrorHandler {
    if (!globalErrorHandler) {
        throw new Error('ErrorHandler not initialized');
    }
    return globalErrorHandler;
}

/**
 * 装饰器：自动处理函数错误
 */
export function withErrorHandling<T>(
    operation: string,
    options: Partial<ErrorHandlerOptions> = {}
) {
    return function (
        target: any,
        propertyName: string,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => T>
    ) {
        const method = descriptor.value!;

        descriptor.value = function (this: any, ...args: any[]): T {
            const handler = getErrorHandler();
            return handler.handleSync(operation, () => method.apply(this, args), options);
        };

        return descriptor;
    };
}

/**
 * 异步版本的错误处理装饰器
 */
export function withAsyncErrorHandling<T>(
    operation: string,
    options: Partial<ErrorHandlerOptions> = {}
) {
    return function (
        target: any,
        propertyName: string,
        descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<T>>
    ) {
        const method = descriptor.value!;

        descriptor.value = async function (this: any, ...args: any[]): Promise<T> {
            const handler = getErrorHandler();
            return await handler.handleAsync(operation, () => method.apply(this, args), options);
        };

        return descriptor;
    };
}