# PureBasic 调试适配器（DAP）开发计划

> 本文档记录为 vscode-purebasic 扩展实现完整 DAP 调试适配器的技术方案，供后续开发参考。
> 协议分析来源：[fantaisie-software/purebasic](https://github.com/fantaisie-software/purebasic) 开源 IDE 代码。

---

## 实施进度

| 阶段 | 状态 | 完成日期 | 说明 |
|------|------|---------|------|
| 阶段一：最小可用（启动/断点/继续） | ✅ 已完成 | 2026-02-23 | 所有源文件创建完毕，TypeScript 编译通过，webpack bundle 生成 |
| 测试套件（单元 + 集成） | ✅ 已完成 | 2026-02-24 | 69 个测试全部通过，核心协议层 100% 覆盖 |
| 阶段二：变量查看 | 🔲 待实现 | — | variableParser.ts 已实现，DAP handlers 待真机测试 |
| 阶段三：调用栈 + 单步 | 🔲 待实现 | — | — |
| 阶段四：表达式求值 | 🔲 待实现 | — | — |
| 阶段五：健壮性优化 | 🔲 待实现 | — | — |

### 阶段一已完成内容

**新增文件：**
- `src/debug/types/debugTypes.ts` — `LaunchRequestArguments`（继承 DAP 类型）、`CommandInfo`、`PBVariable`、`PBStackFrame`、`CompileResult`
- `src/debug/protocol/commands.ts` — `PBCommand` / `PBEvent` const enum、协议常量
- `src/debug/protocol/CommandInfo.ts` — 20 字节头部序列化/反序列化（`serialize` / `deserialize`）
- `src/debug/protocol/variableParser.ts` — 二进制变量数据解析（支持所有 10 种 PB 类型）
- `src/debug/transport/MessageBuffer.ts` — 流式粘包处理
- `src/debug/transport/PipeTransport.ts` — Windows 双命名管道（`net.createServer().listen(\\.\pipe\...)` 模式）
- `src/debug/compiler/CompilerLauncher.ts` — `pbcompiler.exe` 编译 + 进程启动 + 管道 ID 注入
- `src/debug/session/sessionState.ts` — 会话状态机（idle/launching/running/stopped/terminated）
- `src/debug/session/PBDebugSession.ts` — 完整 DAP 处理器（阶段一至四全部实现）
- `src/debug/debugAdapter.ts` — 适配器入口（`DebugSession.run`）

**修改文件：**
- `package.json` — 新增 `contributes.debuggers`、`breakpoints`；扩展 `activationEvents`
- `webpack.config.js` — 新增第三个入口 `src/debug/debugAdapter.ts → out/debug/debugAdapter.js`
- `src/extension.ts` — 注册 `DebugConfigurationProvider`（支持无 launch.json 时 F5 直接调试）

**测试覆盖率（2026-02-24）：**

| 模块 | 语句 | 分支 | 函数 | 行 |
|------|------|------|------|-----|
| `CommandInfo.ts` | 100% | 100% | 100% | 100% |
| `commands.ts` | 100% | 100% | 100% | 100% |
| `variableParser.ts` | 94% | 86% | 100% | 100% |
| `MessageBuffer.ts` | 100% | 100% | 100% | 100% |
| `PipeTransport.ts` | 93% | 85% | 83% | 98% |
| `sessionState.ts` | 100% | 100% | 100% | 100% |
| `PBDebugSession.ts` | 33% | 27% | 22% | 34% |

> `PBDebugSession.ts` 覆盖率低是预期行为：launch/configurationDone/stackTrace 等需要真实管道连接的路径不在单元测试范围内，由集成测试（需要 PureBasic 运行时）覆盖。

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [技术原理：PureBasic 调试协议](#2-技术原理purebasic-调试协议)
3. [架构设计](#3-架构设计)
4. [文件结构](#4-文件结构)
5. [配置修改清单](#5-配置修改清单)
6. [分阶段实施路径](#6-分阶段实施路径)
7. [核心实现要点](#7-核心实现要点)
8. [风险与挑战](#8-风险与挑战)

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

### 2.1 传输层：Windows 命名管道

PureBasic 调试系统使用**两条单向命名管道**实现双向通信：

```
PipeA: \\.\pipe\PureBasic_DebuggerPipeA_XXXXXXXX  (调试器 → 被调试程序)
PipeB: \\.\pipe\PureBasic_DebuggerPipeB_XXXXXXXX  (被调试程序 → 调试器)
```

- `XXXXXXXX` 为 8 位十六进制随机 ID，由调试器在启动时生成。
- 管道 ID 通过环境变量 `PB_DEBUGGER_Communication` 注入被调试进程（格式：`XXXXXXXX`）。
- **连接顺序**（非常重要）：调试器必须先以 `CreateNamedPipe` 创建两条管道，然后才能启动被调试程序，被调试程序随后以 `CreateFile` 连接。

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
| 3 | **BreakPoint** | 1=Add / 2=Remove / 3=Clear | `(fileNum << 16) \| lineNum` | — |
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
│  │ DAPSession   │   │ PipeClient     │   │ CompilerLauncher  │ │
│  │ (vscode-dap) │◄──│ (命名管道收发) │   │ (调用 pbcompiler) │ │
│  └──────────────┘   └───────┬────────┘   └───────────────────┘ │
│                              │ Win32 Pipe                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │  PipeA (命令) / PipeB (事件)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  PureBasic 被调试程序（目标进程）                                  │
│  由 pbcompiler 编译并在 /DEBUGGER 模式下启动                      │
│  通过环境变量 PB_DEBUGGER_Communication 获知管道 ID               │
└─────────────────────────────────────────────────────────────────┘
```

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
│   ├── PipeTransport.ts     # 命名管道连接管理（创建、等待连接、读写）
│   └── MessageBuffer.ts     # 粘包处理（按 DataSize 字段分帧）
├── compiler/
│   └── CompilerLauncher.ts  # 调用 pbcompiler.exe，管理编译和进程启动
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
| `PipeTransport.ts` | 封装 `net.Socket` 或 `fs.open('\\\\.\\pipe\\...')` 的读写，发出 `message` 事件 |
| `MessageBuffer.ts` | 维护接收缓冲区，按 `DataSize` 字段切割完整帧 |
| `CompilerLauncher.ts` | 生成管道 ID，构造编译命令行，启动 `pbcompiler.exe`，等待编译完成 |
| `debugTypes.ts` | `PBVariable`、`PBStackFrame`、`LaunchConfig` 等类型 |

---

## 5. 配置修改清单

### 5.1 `package.json`

```json
// 在 "contributes" 中添加：
{
  "debuggers": [
    {
      "type": "purebasic",
      "label": "PureBasic",
      "program": "./out/debug/debugAdapter.js",
      "runtime": "node",
      "languages": ["purebasic"],
      "configurationAttributes": {
        "launch": {
          "required": ["program"],
          "properties": {
            "program": {
              "type": "string",
              "description": "PureBasic source file (.pb) to debug",
              "default": "${file}"
            },
            "compiler": {
              "type": "string",
              "description": "Path to pbcompiler.exe",
              "default": "pbcompiler"
            },
            "stopOnEntry": {
              "type": "boolean",
              "description": "Stop at first line when launching",
              "default": true
            }
          }
        }
      },
      "initialConfigurations": [
        {
          "type": "purebasic",
          "request": "launch",
          "name": "Debug PureBasic",
          "program": "${file}",
          "stopOnEntry": true
        }
      ]
    }
  ],
  "breakpoints": [
    { "language": "purebasic" }
  ]
}

// 在 "activationEvents" 中添加：
"onDebugResolve:purebasic",
"onDebugAdapterProtocolTracker:purebasic"

// 在 "dependencies" 中添加：
"@vscode/debugadapter": "^1.65.0",
"@vscode/debugprotocol": "^1.65.0"
```

### 5.2 `webpack.config.js`

在现有两个入口（extension、server）的基础上，新增第三个入口：

```javascript
// 新增调试适配器入口
{
  target: 'node',
  entry: {
    'debug/debugAdapter': './src/debug/debugAdapter.ts',
  },
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
  },
  // 使用与 server 相同的 externals 和 resolve 配置
  externals: {
    vscode: 'commonjs vscode',
  },
  // ... 其余与 server 条目相同
}
```

> 注：若 `webpack.config.js` 使用 `module.exports = [entry1, entry2]` 数组形式，直接追加第三项即可。

### 5.3 `tsconfig.json`

确认 `src/debug/**` **未被** `exclude` 排除。若有如下配置则删除：

```json
// 删除（若存在）：
"exclude": ["src/debug"]
```

通常无需修改，默认包含 `src/` 下所有 `.ts` 文件。

### 5.4 `src/extension.ts`

注册调试配置提供者（可选但推荐，支持自动推导配置）：

```typescript
import * as vscode from 'vscode';

// 在 activate() 函数中添加：
context.subscriptions.push(
  vscode.debug.registerDebugConfigurationProvider('purebasic', {
    resolveDebugConfiguration(
      folder: vscode.WorkspaceFolder | undefined,
      config: vscode.DebugConfiguration
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
      // 若未配置 launch.json，提供默认值
      if (!config.type && !config.request && !config.name) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'purebasic') {
          config.type = 'purebasic';
          config.name = 'Debug PureBasic';
          config.request = 'launch';
          config.program = '${file}';
          config.stopOnEntry = true;
        }
      }
      return config;
    }
  })
);
```

---

## 6. 分阶段实施路径

### 阶段一：最小可用（启动 + 断点 + 继续）

**目标**：能在 VSCode 中按 F5 启动调试，命中断点后暂停，按 F5 继续。

**任务**：
1. 安装依赖：`npm install @vscode/debugadapter @vscode/debugprotocol`
2. 实现 `CompilerLauncher.ts`：生成管道 ID，调用 `pbcompiler.exe` 编译
3. 实现 `PipeTransport.ts`：创建命名管道，等待被调试程序连接
4. 实现 `CommandInfo.ts`：序列化/反序列化 20 字节头
5. 实现 `MessageBuffer.ts`：粘包处理
6. 实现 `PBDebugSession.ts` 骨架：
   - `launchRequest`：编译 → 创建管道 → 启动程序 → 握手
   - `setBreakpointsRequest`：发送 BreakPoint 命令（ID=3）
   - `continueRequest`：发送 Run 命令（ID=2）
   - 处理 `Stopped` 事件（ID=4）：发出 DAP `stopped` 事件
   - 处理 `End` 事件（ID=5）：发出 DAP `terminated` 事件
7. 修改 `package.json` 和 `webpack.config.js`
8. 编译并打包测试

**验收标准**：在 `.pb` 文件中设断点，F5 启动后程序停在断点行，再按 F5 继续执行至结束。

---

### 阶段二：变量查看

**目标**：暂停时在"变量"面板查看全局和局部变量。

**任务**：
1. 实现 `variableParser.ts`：解析二进制变量数据
2. `PBDebugSession.ts` 新增：
   - `scopesRequest`：返回 "Globals" 和 "Locals" 两个作用域
   - `variablesRequest`：
     - 全局：发送 `GetGlobalNames`（ID=9）+ `GetGlobals`（ID=10），等待两个响应后合并
     - 局部：发送 `GetLocalNames`（ID=12）+ `GetLocals`（ID=11），传入过程索引
3. 处理 `GlobalNames`（ID=18）、`Globals`（ID=19）、`LocalNames`（ID=20）、`Locals`（ID=21）响应

**验收标准**：暂停时"变量"面板显示正确的变量名和值，包括 String 类型。

---

### 阶段三：调用栈 + 单步

**目标**：暂停时查看调用栈，使用 F10/F11/Shift+F11 单步调试。

**任务**：
1. `PBDebugSession.ts` 新增：
   - `stackTraceRequest`：发送 `GetHistory`（ID=16），解析 `History`（ID=17）响应
   - `nextRequest`：发送 Step 命令（ID=1，Value2=1 Over）
   - `stepInRequest`：发送 Step 命令（ID=1，Value2=0 Into）
   - `stepOutRequest`：发送 Step 命令（ID=1，Value2=2 Out）
2. 解析 `History` 数据格式（[4B 行号][UTF-16LE 过程名\0]...）
3. 维护文件编号到文件路径的映射（`Stopped` 事件中的 `fileNum`）

**验收标准**：调用栈面板显示正确的栈帧，单步操作正常工作。

---

### 阶段四：表达式求值

**目标**：监视窗口和调试控制台支持表达式求值。

**任务**：
1. `PBDebugSession.ts` 新增：
   - `evaluateRequest`：发送 `EvaluateExpression`（ID=33，Data=UTF-8 表达式）
   - 处理 `ExpressionResult`（ID=34）响应
2. 处理 `DebugPrint`（ID=7）事件：发出 DAP `output` 事件到调试控制台
3. 处理 `Error`（ID=6）事件：发出 DAP `output` 事件（category: "stderr"）

**验收标准**：监视窗口中输入 PureBasic 变量名/表达式，显示当前值；`Debug` 语句输出到调试控制台。

---

### 阶段五：健壮性与体验优化

**目标**：提升稳定性和用户体验。

**任务**：
1. 超时处理：管道连接、编译过程设置超时，超时后报错并清理
2. 进程清理：调试会话结束或 VSCode 关闭时，确保被调试程序和管道被正确清理
3. 错误信息本地化：将协议错误转换为友好的 VSCode 通知
4. `disconnectRequest`：发送 Kill 命令（ID=37），等待 End 事件后断开管道
5. `pauseRequest`：发送 Stop 命令（ID=0）
6. 多文件支持：正确处理 `IncludeFile` 引入文件的断点（fileNum 映射）
7. 添加调试日志（可通过 `launch.json` 中 `"trace": true` 启用）

---

## 7. 核心实现要点

### 7.1 管道连接顺序（关键）

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

### 7.2 粘包处理

TCP/命名管道是流式传输，必须根据消息头的 `DataSize` 字段手动分帧：

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

### 7.3 异步请求-响应匹配

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

### 7.4 String 类型解码

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

### 7.5 文件编号映射

PB 调试协议用 `fileNum`（整数）标识文件，而 DAP 用文件路径（URI）。需维护映射表：

```typescript
// 在 launchRequest 时建立映射
// fileNum=0 始终是主文件（被编译的 .pb 文件）
// IncludeFile 对应的 fileNum 在首次 Stopped 事件中出现
private fileNumToPath = new Map<number, string>();
```

---

## 8. 风险与挑战

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| **管道方向确认**：PipeA/PipeB 哪个是输入/输出可能与文档相反 | 中 | 实现后通过实际测试确认，协议握手可验证方向 |
| **命名管道 API**：Node.js 在 Windows 上使用 `net.createServer('\\\\.\\pipe\\...')` 而非 Win32 API | 中 | 使用 `net` 模块，服务端 `createServer` + `listen`，客户端 `createConnection` |
| **竞态条件**：被调试程序启动后可能在调试器连接管道之前就尝试连接 | 中 | `CreateNamedPipe` 必须在启动程序之前完成（参见 7.1） |
| **String 类型编码**：不同 PB 版本可能使用不同编码（UTF-16LE vs ASCII） | 低 | 通过协议版本号区分，先实现 UTF-16LE |
| **64 位 vs 32 位**：Integer/Pointer 大小不同 | 低 | 通过 `launch.json` 配置项或编译器输出判断目标位数 |
| **编译器路径**：用户环境中 `pbcompiler.exe` 可能不在 PATH | 低 | 在 `launch.json` 提供 `compiler` 配置项，并给出友好的错误提示 |
| **管道缓冲区溢出**：大量局部变量导致单次响应超出缓冲区 | 低 | `MessageBuffer` 动态扩展，无固定大小限制 |
| **进程泄漏**：调试会话意外断开时被调试程序未被终止 | 中 | 注册 `process.on('exit')` 和 VSCode `onDidTerminateDebugSession` 事件进行清理 |

### 平台限制

- 命名管道为 **Windows 专有**。在 macOS/Linux 上，PureBasic 的调试协议实现不同（可能使用 Unix domain socket 或其他机制）。当前计划**仅覆盖 Windows 平台**。
- 若需跨平台支持，需要研究 PureBasic 在 macOS/Linux 上的调试协议实现。

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
