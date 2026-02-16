/**
 * 哈希工具函数
 * 用于生成文档内容的哈希值，便于缓存管理
 */

import * as crypto from 'crypto';

/**
 * 生成字符串的MD5哈希值
 */
export function generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * 简单的字符串哈希函数（更快的替代方案）
 */
export function simpleHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return hash;
}
