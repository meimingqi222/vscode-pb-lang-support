# PureBasic 调试适配器（DAP）技术文档

> 本文档介绍 vscode-purebasic 扩展中调试适配器的技术原理和实现细节。
> 协议分析来源：[fantaisie-software/purebasic](https://github.com/fantaisie-software/purebasic) 开源 IDE 代码。

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [技术原理：PureBasic 调试协议](#2-技术原理purebasic-调试协议)
3. [架构设计](#3-架构设计)
4. [文件结构](#4-文件结构)
5. [配置说明](#5-配置说明)
6. [核心实现要点](#6-核心实现要点)
7. [风险与挑战](#7-风险与挑战)

---

## 1. 背景与目标

### 现状

vscode-purebasic 目前提供语言服务器功能（语法高亮、补全、悬停文档、诊断等），但**不支持调试**。用户无法在 VSCode 中设置断点、查看变量、单步执行 PureBasic 程序。

### 目标能力

实现方案 A（完整 DAP 调试适配器）后，将支持：

| 功能 | DAP 请求/事件 |
|------|--------------|
| 启动/附加调试会话 | `launch` / `attach` |
| 设置/删除断点 | `setBreakpoints` |
| 继续执行 | `continue` |
| 单步（Into / Over / Out） | `next` / `stepIn` / `stepOut` |
| 暂停 | `pause` |
| 查看调用栈 | `stackTrace` |
| 查看变量（局部/全局） | `variables` / `scopes` |
| 表达式求值（监视窗口） | `evaluate` |
| 调试输出（Debug Print） | `output` 事件 |
| 程序终止 | `terminated` 事件 |

### 为什么选方案 A（自制 DAP 适配器）

- PureBasic 使用**专有命名管道协议**，与 GDB/LLDB 等通用协议不兼容。
- 官方 IDE（PureBasic IDE）通过同一协议与被调试进程通信，已有完整开源实现可参考。
- 自制适配器可完全掌控协议细节，支持 PureBasic 特有类型（String、Pointer 等）。

---

## 2. 技术原理：PureBasic 调试协议

### 2.1 传输层

PureBasic 调试系统支持多种传输方式，使用**两条单向通道**实现双向通信：

#### Windows 命名管道（Named Pipe）

```
PipeA: \\.\pipe\PureBasic_DebuggerPipeA_XXXXXXXX  (调试器 → 被调试程序)
PipeB: \\.\pipe\PureBasic_DebuggerPipeB_XXXXXXXX  (被调试程序 → 调试器)
```

- `XXXXXXXX` 为 8 位十六进制随机 ID，由调试器在启动时生成
- 管道 ID 通过环境变量 `PB_DEBUGGER_Communication` 注入被调试进程（格式：`XXXXXXXX`）

#### Unix FIFO（macOS/Linux）

```
PipeA: /tmp/PureBasic_DebuggerPipeA_XXXXXXXX
PipeB: /tmp/PureBasic_DebuggerPipeB_XXXXXXXX
```

- 使用 FIFO 特殊文件（命名管道）实现进程间通信
- 同样需要严格遵循连接顺序

#### TCP 网络（跨平台）

```
Host: 127.0.0.1 (可配置)
Port: 随机可用端口
```

- 通过 TCP socket 通信
- 适用于远程调试场景

**连接顺序**（所有传输方式通用）：
调试器必须先创建/监听通道，然后才能启动被调试程序。

### 2.2 消息格式：`CommandInfo` 结构体

每条消息由**固定 20 字节头部** + **可变数据**组成，所有字段为小端序：

```
Offset  Size  Field       说明
------  ----  ----------  ------------------------------------------
0       4     Command     命令 ID（见下表）
4       4     DataSize    后续 Data 字节数（0 表示无数据）
8       4     Value1      命令参数 1（含义依命令而定）
12      4     Value2      命令参数 2（含义依命令而定）
16      4     Timestamp   调试器填写时间戳（程序侧可忽略）
20      N     Data        可变长度数据（DataSize > 0 时存在）
```

> **协议版本号：12**。握手时双方交换版本，不一致则报错断开。

### 2.3 命令集

#### 调试器 → 被调试程序

| Command ID | 名称 | Value1 | Value2 | Data |
|-----------|------|--------|--------|------|
| 0 | **Stop**（暂停） | — | — | — |
| 1 | **Step**（单步） | — | 0=Into / 1=Over / 2=Out | — |
| 2 | **Run**（继续） | — | — | — |
| 3 | **BreakPoint** | 1=Add / 2=Remove / 3=Clear | `(fileNum << 20) \| lineNum` | — |
| 4 | **ClearBreakPoints** | — | — | — |
| 9 | **GetGlobalNames** | — | — | — |
| 10 | **GetGlobals** | — | — | — |
| 11 | **GetLocals** | 过程索引 | — | — |
| 12 | **GetLocalNames** | 过程索引 | — | — |
| 16 | **GetHistory**（调用栈） | — | — | — |
| 33 | **EvaluateExpression** | — | — | UTF-8 表达式字符串 |
| 37 | **Kill**（终止程序） | — | — | — |

#### 被调试程序 → 调试器

| Command ID | 名称 | Value1 | Value2 | Data |
|-----------|------|--------|--------|------|
| 4 | **Stopped** | fileNum | lineNum | — |
| 5 | **End** | 退出码 | — | — |
| 6 | **Error**（运行时错误） | — | — | UTF-16LE 错误描述 |
| 7 | **DebugPrint** | — | — | UTF-16LE 文本 |
| 8 | **CallDebugger** | fileNum | lineNum | — |
| 17 | **History**（栈帧数据） | — | — | 见下文 |
| 18 | **GlobalNames** | — | — | 名称列表（见下文） |
| 19 | **Globals** | — | — | 变量值列表 |
| 20 | **LocalNames** | — | — | 名称列表 |
| 21 | **Locals** | — | — | 变量值列表 |
| 34 | **ExpressionResult** | — | — | UTF-8 结果字符串 |

### 2.4 History（调用栈）数据格式

`History` 消息的 Data 段为连续帧记录，每帧格式：

```
[4B little-endian 行号] [UTF-16LE 过程名 \0]
```

栈顶帧（当前执行位置）在最前面。

### 2.5 变量名称/值列表格式

`GlobalNames` / `LocalNames` 数据段：

```
[4B 变量数量 N]
N × { [4B 类型ID] [UTF-16LE 变量名 \0] }
```

`Globals` / `Locals` 数据段：

```
N × { 根据类型ID解析的值 }
```

| 类型 ID | PureBasic 类型 | 值格式 |
|--------|---------------|--------|
| 1 | Byte | 1B 有符号 |
| 2 | Word | 2B 有符号 |
| 3 | Long | 4B 有符号 |
| 4 | Float | 4B IEEE 754 |
| 5 | String | 4B 长度 + UTF-16LE 字符 |
| 6 | Double | 8B IEEE 754 |
| 7 | Quad | 8B 有符号 |
| 8 | Character | 2B |
| 9 | Pointer | 4B 或 8B（取决于目标位数） |
| 10 | Integer | 4B 或 8B（取决于目标位数） |

### 2.6 编译器接口

```bash
# 方式一：直接编译（推荐用于调试启动）
pbcompiler.exe source.pb /DEBUGGER /EXE output.exe

# 方式二：Standby 管道模式（供 IDE 长期复用）
pbcompiler.exe --standby
```

调试启动时，需在编译完成后再连接管道并启动程序。

---

## 3. 架构设计

### 三进程模型

```
┌─────────────────────────────────────────────────────────────────┐
│  VSCode Extension Host                                          │
│  src/extension.ts                                               │
│  ┌──────────────────────┐   DebugConfigurationProvider         │
│  │  LanguageClient (LSP)│   (注册调试类型 "purebasic")          │
│  └──────────────────────┘                                       │
└───────────────────────┬─────────────────────────────────────────┘
                        │  DAP (stdio)
                        │  JSON-RPC over stdin/stdout
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Debug Adapter Process                                          │
│  out/debug/debugAdapter.js  (独立 Node.js 进程)                  │
│                                                                  │
│  ┌──────────────┐   ┌────────────────┐   ┌───────────────────┐ │
│  │ DAPSession   │   │ Transport      │   │ CompilerLauncher  │ │
│  │ (vscode-dap) │◄──│ (多种传输实现) │   │ (调用 pbcompiler) │ │
│  └──────────────┘   └───────┬────────┘   └───────────────────┘ │
│                             │ Pipe/FIFO/TCP                     │
└─────────────────────────────┼───────────────────────────────────┘
                              │  PipeA (命令) / PipeB (事件)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PureBasic 被调试程序（目标进程）                                  │
│  由 pbcompiler 编译并在 /DEBUGGER 模式下启动                      │
│  通过环境变量 PB_DEBUGGER_Communication 获知连接信息              │
└─────────────────────────────────────────────────────────────────┘
```

### 传输层抽象

调试器支持多种传输方式，通过统一接口抽象：

| 传输方式 | 实现文件 | 适用平台 | 状态 |
|----------|----------|----------|------|
| Named Pipe | `PipeTransport.ts` | Windows | 已验证 |
| FIFO | `FifoTransport.ts` | macOS/Linux | macOS 已验证 |
| TCP | `NetworkTransport.ts` | 跨平台 | 待验证 |
| Native | `NativeTransport.ts` | Windows | 待验证 |

### 数据流示意

```
用户设断点 → VSCode UI
  → DAP setBreakpoints 请求 → DAPSession
  → BreakPoint 命令 (ID=3) → PipeA → PB程序

PB程序命中断点 → Stopped 事件 (ID=4) → PipeB
  → PipeClient → DAPSession
  → DAP stopped 事件 → VSCode UI（高亮当前行）
```

---

## 4. 文件结构

```
src/debug/
├── debugAdapter.ts          # 适配器入口：启动 DAPServer，监听 stdio
├── session/
│   ├── PBDebugSession.ts    # 核心：继承 DebugSession，实现所有 DAP 请求处理器
│   └── sessionState.ts      # 会话状态机（Idle / Running / Stopped / Terminated）
├── protocol/
│   ├── CommandInfo.ts       # CommandInfo 结构体的序列化/反序列化
│   ├── commands.ts          # 命令 ID 常量枚举
│   └── variableParser.ts    # 解析变量名称/值二进制数据
├── transport/
│   ├── PipeTransport.ts     # Windows 命名管道实现
│   ├── FifoTransport.ts     # Unix FIFO 实现（macOS/Linux）
│   ├── NetworkTransport.ts  # TCP 网络传输实现
│   ├── NativeTransport.ts   # Windows Native API 实现
│   ├── TransportFactory.ts  # 传输层工厂，根据配置创建对应传输实例
│   └── MessageBuffer.ts     # 粘包处理（按 DataSize 字段分帧）
├── compiler/
│   └── CompilerLauncher.ts  # 调用 pbcompiler，管理编译和进程启动
└── types/
    └── debugTypes.ts        # 调试相关 TypeScript 类型定义
```

### 各文件职责详解

| 文件 | 职责 |
|------|------|
| `debugAdapter.ts` | 程序入口，创建 `PBDebugSession` 实例，通过 stdio 与 VSCode 通信 |
| `PBDebugSession.ts` | DAP 协议实现核心，将 DAP 请求翻译成 PB 命令，将 PB 事件翻译成 DAP 事件 |
| `sessionState.ts` | 跟踪调试会话状态，防止在错误状态下发送命令 |
| `CommandInfo.ts` | `Buffer` 序列化/反序列化 20 字节头 + Data |
| `commands.ts` | `PBCommand` / `PBEvent` 枚举常量 |
| `variableParser.ts` | 解析 `GlobalNames`/`Globals` 二进制数据，生成 `DebugProtocol.Variable[]` |
| `PipeTransport.ts` | Windows 命名管道实现，使用 `net.createServer` |
| `FifoTransport.ts` | Unix FIFO 实现，使用 `fs.mkfifo` 和文件流 |
| `NetworkTransport.ts` | TCP socket 实现 |
| `TransportFactory.ts` | 根据 `launch.json` 中的 `transport` 配置创建对应传输实例 |
| `MessageBuffer.ts` | 维护接收缓冲区，按 `DataSize` 字段切割完整帧 |
| `CompilerLauncher.ts` | 生成连接 ID，构造编译命令行，启动 `pbcompiler`，等待编译完成 |
| `debugTypes.ts` | `PBVariable`、`PBStackFrame`、`LaunchConfig` 等类型 |

---

## 5. 配置说明

### 5.1 最小配置示例

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "purebasic",
      "request": "launch",
      "name": "Debug PureBasic",
      "program": "${file}",
      "stopOnEntry": false
    }
  ]
}
```

或使用 F5 快捷键直接启动（无需配置文件）。

### 5.2 完整配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `program` | string | `${file}` | 要调试的 PureBasic 源文件路径 |
| `compiler` | string | `pbcompiler` | PureBasic 编译器路径 |
| `stopOnEntry` | boolean | `false` | 启动时是否在入口点暂停 |
| `transport` | string | `auto` | 传输方式：`auto`、`pipe`、`fifo`、`network`、`native` |
| `debugHost` | string | `127.0.0.1` | 网络模式下的主机地址 |
| `communication` | string | 自动生成 | 强制指定通信 ID（高级选项） |
| `trace` | boolean | `false` | 启用详细调试日志 |

### 5.3 传输模式选择

| 模式 | Windows | Linux | macOS | 说明 |
|------|---------|-------|-------|------|
| `auto` | Named Pipe ✓ | FIFO¹ | FIFO ✓ | 自动选择平台最佳方式 |
| `pipe` | Named Pipe | - | - | Windows 命名管道 |
| `fifo` | - | FIFO¹ | FIFO¹ | Unix FIFO |
| `network` | TCP | TCP | TCP | TCP socket |
| `native` | Native API | - | - | Windows Native API |

**图例**：✓ = 已验证，¹ = 预期可用（未验证），- = 不支持

### 5.4 `PB_DEBUGGER_Options` 环境变量

编译后的程序通过环境变量接收调试配置：

```
PB_DEBUGGER_Options: <unicode>;<callOnStart>;<callOnEnd>;<bigEndian>
```

- `unicode`: 始终为 `1`（UTF-16LE 编码）
- `callOnStart`: `1` = 启动时暂停（由 `stopOnEntry` 控制）
- `callOnEnd`: 始终为 `0`
- `bigEndian`: 始终为 `0`（小端序）

---

## 6. 核心实现要点

### 6.1 通道连接顺序（关键）

```
调试器进程                          被调试进程
-----------                          ----------
1. 生成随机 PIPE_ID
2. CreateNamedPipe(PipeA)  ────►
3. CreateNamedPipe(PipeB)  ────►
4. 设置环境变量 PB_DEBUGGER_Communication=PIPE_ID
5. 启动 pbcompiler.exe 编译
6. 等待编译完成
7. 启动被调试程序（继承环境变量）
                                     8. 读取环境变量获取 PIPE_ID
8. ConnectNamedPipe(PipeA)           9. CreateFile(PipeA)  ◄────
9. ConnectNamedPipe(PipeB)           10. CreateFile(PipeB) ◄────
10. 握手（交换协议版本=12）
```

> **错误陷阱**：若先启动程序再创建管道，程序将因连接失败而崩溃。必须先创建管道。

### 6.2 粘包处理

所有传输方式（Named Pipe、FIFO、TCP）都是流式传输，必须根据消息头的 `DataSize` 字段手动分帧：

```typescript
// MessageBuffer.ts 伪代码
class MessageBuffer {
  private buffer: Buffer = Buffer.alloc(0);

  append(chunk: Buffer): CommandInfo[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: CommandInfo[] = [];

    while (this.buffer.length >= 20) {  // 至少有完整头部
      const dataSize = this.buffer.readUInt32LE(4);
      const totalSize = 20 + dataSize;

      if (this.buffer.length < totalSize) break;  // 等待更多数据

      messages.push(parseCommandInfo(this.buffer.slice(0, totalSize)));
      this.buffer = this.buffer.slice(totalSize);
    }

    return messages;
  }
}
```

### 6.3 异步请求-响应匹配

PB 协议没有请求 ID，响应按命令类型区分。需维护一个等待队列：

```typescript
// 发送请求并等待特定类型的响应
async request(command: PBCommand, responseType: PBEvent, ...): Promise<CommandInfo> {
  return new Promise((resolve) => {
    this.pendingResponses.set(responseType, resolve);
    this.send(command, ...);
  });
}
```

> **注意**：`GetGlobalNames` 和 `GetGlobals` 需要分别等待各自的响应，不能并发发送（协议不支持请求 ID）。

### 6.4 String 类型解码

PureBasic 的 String 在调试协议中以 UTF-16LE 编码传输：

```typescript
function decodeUTF16LEString(buf: Buffer, offset: number): string {
  // 先读 4B 长度（字符数，不包括终止符）
  const charCount = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + charCount * 2;
  return buf.slice(start, end).toString('utf16le');
}
```

### 6.5 文件编号映射

PB 调试协议用 `fileNum`（整数）标识文件，而 DAP 用文件路径（URI）。需维护映射表：

```typescript
// 在 launchRequest 时建立映射
// fileNum=0 始终是主文件（被编译的 .pb 文件）
// IncludeFile 对应的 fileNum 在首次 Stopped 事件中出现
private fileNumToPath = new Map<number, string>();
```

---

## 7. 风险与挑战

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| **管道方向确认**：PipeA/PipeB 哪个是输入/输出可能与文档相反 | 中 | 实现后通过实际测试确认，协议握手可验证方向 |
| **命名管道 API**：Node.js 在 Windows 上使用 `net.createServer('\\\\.\\pipe\\...')` 而非 Win32 API | 中 | 使用 `net` 模块，服务端 `createServer` + `listen`，客户端 `createConnection` |
| **竞态条件**：被调试程序启动后可能在调试器连接通道之前就尝试连接 | 中 | 必须先创建/监听通道，然后启动程序（参见 6.1） |
| **String 类型编码**：不同 PB 版本可能使用不同编码（UTF-16LE vs ASCII） | 低 | 通过协议版本号区分，先实现 UTF-16LE |
| **64 位 vs 32 位**：Integer/Pointer 大小不同 | 低 | 通过 `launch.json` 配置项或编译器输出判断目标位数 |
| **编译器路径**：用户环境中 `pbcompiler.exe` 可能不在 PATH | 低 | 在 `launch.json` 提供 `compiler` 配置项，并给出友好的错误提示 |
| **管道缓冲区溢出**：大量局部变量导致单次响应超出缓冲区 | 低 | `MessageBuffer` 动态扩展，无固定大小限制 |
| **进程泄漏**：调试会话意外断开时被调试程序未被终止 | 中 | 注册 `process.on('exit')` 和 VSCode `onDidTerminateDebugSession` 事件进行清理 |

### 平台支持

| 平台 | 传输方式 | 状态 |
|------|----------|------|
| Windows | Named Pipe | 已验证 |
| macOS | FIFO | 已验证 |
| Linux | FIFO | 预期可用（未验证） |

所有平台使用相同的 PureBasic 调试协议，只是传输层实现不同。

---

## 附录：参考资料

- [fantaisie-software/purebasic](https://github.com/fantaisie-software/purebasic) — PureBasic 官方开源 IDE，包含完整调试协议实现
  - `PureBasicIDE/Debugger.pb` — 调试器主逻辑
  - `PureBasicIDE/DebuggerInterface.pb` — 调试协议命令/事件定义
- [Microsoft DAP 规范](https://microsoft.github.io/debug-adapter-protocol/specification) — Debug Adapter Protocol 完整规范
- [@vscode/debugadapter](https://www.npmjs.com/package/@vscode/debugadapter) — VSCode 官方 DAP Node.js SDK
- 本项目现有可复用代码：
  - `src/server/utils/error-handler.ts` — `ErrorHandler` 类
  - `src/types/generics.ts` — `Result<T,E>` 等泛型工具类型
  - `src/server/utils/fs-utils.ts` — 文件路径工具
