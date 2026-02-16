/**
 * 缓存工具类型定义
 */

import { CancellationToken } from './generics';
import { Disposable } from '../core/config';

/** 缓存条目 */
export interface CacheEntry<T> {
    /** 缓存值 */
    value: T;
    /** 创建时间 */
    createdAt: number;
    /** 最后访问时间 */
    lastAccessed: number;
    /** 访问次数 */
    accessCount: number;
    /** 过期时间 */
    expiresAt?: number;
    /** 大小（字节） */
    size?: number;
    /** 元数据 */
    metadata?: Record<string, unknown>;
}

/** 缓存选项 */
export interface CacheOptions<K, V> {
    /** 最大条目数 */
    maxSize?: number;
    /** TTL（毫秒） */
    ttl?: number;
    /** 是否启用LRU淘汰 */
    enableLRU?: boolean;
    /** 是否启用TTL淘汰 */
    enableTTL?: boolean;
    /** 键序列化函数 */
    keySerializer?: (key: K) => string;
    /** 值序列化函数 */
    valueSerializer?: (value: V) => string;
    /** 值反序列化函数 */
    valueDeserializer?: (serialized: string) => V;
    /** 大小计算函数 */
    sizeCalculator?: (value: V) => number;
    /** 清理回调 */
    onEvict?: (key: K, entry: CacheEntry<V>) => void;
    /** 清理间隔（毫秒） */
    cleanupInterval?: number;
}

/** 缓存统计 */
export interface CacheStats {
    /** 命中次数 */
    hits: number;
    /** 未命中次数 */
    misses: number;
    /** 命中率 */
    hitRate: number;
    /** 总条目数 */
    totalEntries: number;
    /** 总大小（字节） */
    totalSize: number;
    /** 过期条目数 */
    expiredEntries: number;
    /** 淘汰条目数 */
    evictedEntries: number;
    /** 平均访问时间 */
    averageAccessTime: number;
    /** 创建时间 */
    createdAt: number;
}

/** 缓存接口 */
export interface Cache<K, V> {
    /** 获取值 */
    get(key: K): V | undefined;
    /** 设置值 */
    set(key: K, value: V, options?: CacheSetOptions<V>): void;
    /** 检查是否存在 */
    has(key: K): boolean;
    /** 删除值 */
    delete(key: K): boolean;
    /** 清空缓存 */
    clear(): void;
    /** 获取所有键 */
    keys(): K[];
    /** 获取所有值 */
    values(): V[];
    /** 获取所有条目 */
    entries(): Array<[K, CacheEntry<V>]>;
    /** 缓存大小 */
    readonly size: number;
    /** 获取统计信息 */
    getStats(): CacheStats;
    /** 开始清理过期条目 */
    startCleanup(): void;
    /** 停止清理过期条目 */
    stopCleanup(): void;
}

/** 缓存设置选项 */
export interface CacheSetOptions<V> {
    /** TTL（毫秒） */
    ttl?: number;
    /** 大小（字节） */
    size?: number;
    /** 元数据 */
    metadata?: Record<string, unknown>;
}

/** 内存缓存接口 */
export interface MemoryCache<K, V> extends Cache<K, V> {
    /** 获取内存使用情况 */
    getMemoryUsage(): CacheMemoryUsage;
    /** 压缩缓存 */
    compress(): Promise<void>;
    /** 解压缓存 */
    decompress(): Promise<void>;
}

/** 缓存内存使用情况 */
export interface CacheMemoryUsage {
    /** 总内存使用（字节） */
    total: number;
    /** 缓存值使用（字节） */
    values: number;
    /** 缓存键使用（字节） */
    keys: number;
    /** 元数据使用（字节） */
    metadata: number;
    /** 其他开销（字节） */
    overhead: number;
}

/** 分布式缓存接口 */
export interface DistributedCache<K, V> extends Cache<K, V> {
    /** 设置值到多个节点 */
    setMulti(keyValues: Array<[K, V]>): Promise<void>;
    /** 获取多个值 */
    getMulti(keys: K[]): Promise<Array<[K, V | undefined]>>;
    /** 删除多个值 */
    deleteMulti(keys: K[]): Promise<number>;
    /** 获取集群状态 */
    getClusterStatus(): Promise<CacheClusterStatus>;
}

/** 缓存集群状态 */
export interface CacheClusterStatus {
    /** 节点数量 */
    nodeCount: number;
    /** 在线节点数量 */
    onlineNodes: number;
    /** 总内存使用 */
    totalMemory: number;
    /** 可用内存 */
    availableMemory: number;
    /** 节点列表 */
    nodes: CacheNodeStatus[];
}

/** 缓存节点状态 */
export interface CacheNodeStatus {
    /** 节点ID */
    id: string;
    /** 节点地址 */
    address: string;
    /** 是否在线 */
    isOnline: boolean;
    /** 内存使用 */
    memoryUsage: CacheMemoryUsage;
    /** 最后心跳时间 */
    lastHeartbeat: number;
}

/** 磁盘缓存接口 */
export interface DiskCache<K, V> extends Cache<K, V> {
    /** 持久化到磁盘 */
    persist(): Promise<void>;
    /** 从磁盘加载 */
    load(): Promise<void>;
    /** 获取磁盘使用情况 */
    getDiskUsage(): CacheDiskUsage;
    /** 压缩磁盘缓存 */
    compressDisk(): Promise<void>;
}

/** 缓存磁盘使用情况 */
export interface CacheDiskUsage {
    /** 总磁盘使用（字节） */
    total: number;
    /** 缓存文件数量 */
    fileCount: number;
    /** 平均文件大小 */
    averageFileSize: number;
    /** 磁盘路径 */
    diskPath: string;
}

/** 多级缓存接口 */
export interface MultiLevelCache<K, V> extends Cache<K, V> {
    /** 添加缓存级别 */
    addLevel(level: number, cache: Cache<K, V>): void;
    /** 移除缓存级别 */
    removeLevel(level: number): void;
    /** 获取缓存级别 */
    getLevel(level: number): Cache<K, V> | undefined;
    /** 获取所有级别 */
    getLevels(): Cache<K, V>[];
}

/** 缓存事件 */
export interface CacheEvent<K, V> {
    /** 事件类型 */
    type: CacheEventType;
    /** 键 */
    key: K;
    /** 值 */
    value?: V;
    /** 时间戳 */
    timestamp: number;
}

/** 缓存事件类型 */
export enum CacheEventType {
    /** 设置值 */
    Set = 'set',
    /** 获取值 */
    Get = 'get',
    /** 删除值 */
    Delete = 'delete',
    /** 清空缓存 */
    Clear = 'clear',
    /** 过期 */
    Expire = 'expire',
    /** 淘汰 */
    Evict = 'evict',
    /** 命中 */
    Hit = 'hit',
    /** 未命中 */
    Miss = 'miss'
}

/** 缓存监听器 */
export interface CacheListener<K, V> {
    /** 处理事件 */
    (event: CacheEvent<K, V>): void | Promise<void>;
}

/** 可观察缓存接口 */
export interface ObservableCache<K, V> extends Cache<K, V> {
    /** 添加事件监听器 */
    on(event: CacheEventType, listener: CacheListener<K, V>): Disposable;
    /** 移除事件监听器 */
    off(event: CacheEventType, listener: CacheListener<K, V>): void;
    /** 触发事件 */
    emit(event: CacheEvent<K, V>): void;
}

/** 带取消标记的缓存 */
export interface CacheWithCancellation<K, V> extends Cache<K, V> {
    /** 带取消标记获取值 */
    getWithCancellation(key: K, token: CancellationToken): Promise<V | undefined>;
    /** 带取消标记设置值 */
    setWithCancellation(key: K, value: V, options: CacheSetOptions<V> & { token: CancellationToken }): Promise<boolean>;
}

/** 流式缓存 */
export interface StreamingCache<K, V> extends Cache<K, V> {
    /** 流式获取值 */
    streamGet(key: K): AsyncIterable<V>;
    /** 流式设置值 */
    streamSet(key: K, values: AsyncIterable<V>): Promise<void>;
    /** 流式删除值 */
    streamDelete(keys: AsyncIterable<K>): Promise<number>;
}

/** 缓存工厂 */
export interface CacheFactory {
    /** 创建内存缓存 */
    createMemoryCache<K, V>(options?: CacheOptions<K, V>): MemoryCache<K, V>;
    /** 创建磁盘缓存 */
    createDiskCache<K, V>(path: string, options?: CacheOptions<K, V>): DiskCache<K, V>;
    /** 创建多级缓存 */
    createMultiLevelCache<K, V>(options?: CacheOptions<K, V>): MultiLevelCache<K, V>;
    /** 创建分布式缓存 */
    createDistributedCache<K, V>(config: DistributedCacheConfig): DistributedCache<K, V>;
}

/** 分布式缓存配置 */
export interface DistributedCacheConfig {
    /** 节点列表 */
    nodes: CacheNodeConfig[];
    /** 复制因子 */
    replicationFactor: number;
    /** 一致性哈希环 */
    hashRing?: HashRingConfig;
    /** 连接超时 */
    connectTimeout: number;
    /** 操作超时 */
    operationTimeout: number;
}

/** 缓存节点配置 */
export interface CacheNodeConfig {
    /** 节点ID */
    id: string;
    /** 节点地址 */
    address: string;
    /** 权重 */
    weight: number;
    /** 是否启用 */
    enabled: boolean;
}

/** 哈希环配置 */
export interface HashRingConfig {
    /** 虚拟节点数 */
    virtualNodes: number;
    /** 哈希算法 */
    hashAlgorithm: string;
    /** 一致性级别 */
    consistency: 'strong' | 'eventual';
}