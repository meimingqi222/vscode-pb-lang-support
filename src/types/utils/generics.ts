/**
 * 泛型工具类型定义
 */

/** 结果类型 */
export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

/** 异步结果类型 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/** 可选属性类型 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** 深度部分类型 */
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** 深度只读类型 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** 深度必填类型 */
export type DeepRequired<T> = {
    [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/** 递归排除类型 */
export type RecursiveExclude<T, U> = T extends object
    ? {
        [P in keyof T]: RecursiveExclude<T[P], U>;
      }
    : T extends U
    ? never
    : T;

/** 递归提取类型 */
export type RecursiveExtract<T, U> = T extends object
    ? {
        [P in keyof T]: RecursiveExtract<T[P], U>;
      }
    : T extends U
    ? T
    : never;

/** 函数参数类型 */
export type FunctionParameters<T> = T extends (...args: infer P) => any ? P : never;

/** 函数返回类型 */
export type FunctionReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

/** 函数this类型 */
export type FunctionThisType<T> = T extends (this: infer U, ...args: any[]) => any ? U : never;

/** 可选函数参数 */
export type OptionalParameters<T> = T extends (...args: infer P) => infer R
    ? (...args: Partial<P>) => R
    : never;

/** 柯里化函数 */
export type CurriedFunction<T> = T extends (...args: infer A) => infer R
    ? A extends [infer First, ...infer Rest]
        ? (arg: First) => CurriedFunction<(...args: Rest) => R>
        : R
    : never;

/** 函数组合 */
export type ComposedFunction<F, G> = F extends (...args: infer A) => infer R
    ? G extends (arg: R) => infer U
        ? (...args: A) => U
        : never
    : never;

/** 事件处理器类型 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/** 异步事件处理器类型 */
export type AsyncEventHandler<T = unknown> = (event: T) => Promise<void>;

/** 比较函数类型 */
export type Comparator<T> = (a: T, b: T) => number;

/** 谓词函数类型 */
export type Predicate<T> = (value: T) => boolean;

/** 异步谓词函数类型 */
export type AsyncPredicate<T> = (value: T) => Promise<boolean>;

/** 映射函数类型 */
export type Mapper<T, U> = (value: T) => U;

/** 异步映射函数类型 */
export type AsyncMapper<T, U> = (value: T) => Promise<U>;

/** 过滤函数类型 */
export type FilterFn<T> = (value: T) => boolean;

/** 异步过滤函数类型 */
export type AsyncFilterFn<T> = (value: T) => Promise<boolean>;

/** 归约函数类型 */
export type Reducer<T, U> = (accumulator: U, value: T) => U;

/** 异步归约函数类型 */
export type AsyncReducer<T, U> = (accumulator: U, value: T) => Promise<U>;

/** 工厂函数类型 */
export type Factory<T, Args extends any[] = any[]> = (...args: Args) => T;

/** 异步工厂函数类型 */
export type AsyncFactory<T, Args extends any[] = any[]> = (...args: Args) => Promise<T>;

/** 构造函数类型 */
export type Constructor<T, Args extends any[] = any[]> = new (...args: Args) => T;

/** 抽象构造函数类型 */
export type AbstractConstructor<T, Args extends any[] = any[]> = abstract new (...args: Args) => T;

/** 实例类型 */
export type InstanceType<T extends Constructor<any>> = T extends Constructor<infer U> ? U : never;

/** 参数类型 */
export type Parameters<T> = T extends (...args: infer P) => any ? P : never;

/** 返回类型 */
export type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

/** this参数类型 */
export type ThisParameterType<T> = T extends (this: infer U, ...args: any[]) => any ? U : unknown;

/** 省略this参数类型 */
export type OmitThisParameter<T> = T extends (this: any, ...args: infer P) => infer R
    ? (...args: P) => R
    : T;

/** 只读数组类型 */
export type ReadonlyArray<T> = Readonly<T[]>;

/** 只读元组类型 */
export type ReadonlyTuple<T extends any[]> = Readonly<T>;

/** 可变元组类型 */
export type WritableTuple<T extends any[]> = T;

/** 联合转交叉类型 */
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

/** 排除null和undefined */
export type NonNullable<T> = T extends null | undefined ? never : T;

/** 提取null和undefined */
export type Nullable<T> = T | null | undefined;

/** 函数类型 */
export type Func<T = any> = (...args: any[]) => T;

/** 异步函数类型 */
export type AsyncFunc<T = any> = (...args: any[]) => Promise<T>;

/** 回调函数类型 */
export type Callback<T = any> = (error: Error | null, result: T) => void;

/** 异步回调函数类型 */
export type AsyncCallback<T = any> = (error: Error | null, result: T) => Promise<void>;

/** 取消标记 */
export interface CancellationToken {
    /** 是否已取消 */
    readonly isCancellationRequested: boolean;
    /** 取消事件 */
    onCancellationRequested: (listener: () => void) => BaseDisposable;
}

/** 进度报告 */
export interface Progress<T> {
    /** 报告进度 */
    report(value: T): void;
}

/** 基础可释放资源 */
export interface BaseDisposable {
    /** 释放资源 */
    dispose(): void;
}

/** 可取消资源 */
export interface CancellationTokenSource extends BaseDisposable {
    /** 取消标记 */
    token: CancellationToken;
    /** 取消操作 */
    cancel(): void;
}

/** 超时选项 */
export interface TimeoutOptions {
    /** 超时时间（毫秒） */
    timeout: number;
    /** 超时回调 */
    onTimeout?: () => void;
}

/** 重试选项 */
export interface RetryOptions {
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试延迟（毫秒） */
    retryDelay: number;
    /** 重试条件 */
    shouldRetry?: (error: Error) => boolean;
    /** 重试回调 */
    onRetry?: (error: Error, attempt: number) => void;
}