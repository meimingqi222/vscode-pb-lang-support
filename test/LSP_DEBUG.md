# LSP功能测试指南

## 修复的问题

我已经修复了LSP功能的主要问题：

1. **转到定义 (F12)** - 改进了正则表达式匹配，能正确识别Procedure/Declare/Prototype定义
2. **查找引用 (Shift+F12)** - 使用更精确的单词边界匹配
3. **悬停提示** - 增加了详细的函数文档和参数信息

## 测试方法

### 1. 开发模式测试
1. 在VSCode中打开 `vscode-purebasic` 文件夹
2. 按 `F5` 启动调试模式
3. 在新窗口中打开 `test/samples/test_basic.pb`

### 2. 查看调试日志
测试时请查看 **输出面板** (Ctrl+Shift+U) 并选择 **PureBasic Language Server** 查看调试信息。

## 具体测试步骤

### 转到定义测试 (F12)
1. 打开 `test_basic.pb`
2. 找到函数调用处，例如：`Debug AddNumbers(5, 3)`
3. 将光标放在 `AddNumbers` 上
4. 按 `F12` - 应该跳转到第14行的 `Procedure.i AddNumbers(a.i, b.i)`

### 查找引用测试 (Shift+F12)
1. 打开 `test_basic.pb`
2. 将光标放在变量名 `integerVar` 上
3. 按 `Shift+F12` - 应该显示所有使用该变量的位置
4. 查看输出面板中的调试日志

### 悬停提示测试
1. 打开 `test_basic.pb`
2. 将鼠标悬停在以下内容上：
   - `OpenWindow` - 应该显示函数参数
   - `Integer` - 应该显示数据类型信息
   - `Procedure` - 应该显示关键字说明
   - `AddNumbers` - 应该显示过程定义信息

## 测试用例

### 测试转到定义
```purebasic
Procedure.i AddNumbers(a.i, b.i)  ; 定义位置
    ProcedureReturn a + b
EndProcedure

Debug AddNumbers(5, 3)           ; 调用位置，F12应该跳转到定义
```

### 测试查找引用
```purebasic
Global integerVar.i = 42         ; 定义位置
Debug integerVar                 ; 引用位置1
integerVar = 100                 ; 引用位置2
Debug integerVar                 ; 引用位置3
```

### 测试悬停提示
```purebasic
; 悬停在这些内容上测试：
OpenWindow(0, 0, 0, 400, 300, "Test", #PB_Window_SystemMenu)
Global myVar.i = 25
Procedure.s MyFunction(param.s)
    ProcedureReturn param
EndProcedure
```

## 预期的调试日志

在输出面板中应该看到类似这样的日志：

```
Definition requested for: {"textDocument":{"uri":"file:///..."},"position":{"line":23,"character":11}}
Looking for definition of: AddNumbers
Found procedure definition at line 14: Procedure.i AddNumbers(a.i, b.i)
```

## 如果功能仍然不工作

1. **检查语言服务器是否启动**：
   - 查看输出面板是否有错误信息
   - 确认没有编译错误

2. **检查文件关联**：
   - 确保 `.pb` 文件被识别为PureBasic语言
   - 检查右下角语言模式是否显示 "PureBasic"

3. **重启扩展**：
   - 在扩展开发主机窗口中按 `Ctrl+R` 重启
   - 或者关闭开发主机窗口，重新按 `F5`

4. **检查语法**：
   - 确保测试文件中的语法正确
   - 特别是Procedure定义的格式

## 下一步调试

如果仍然有问题，请：
1. 记录输出面板中的错误信息
2. 检查开发工具控制台 (Ctrl+Shift+I)
3. 确认语言服务器正在运行 (在任务管理器中查看node.js进程)

修复后的版本应该能够正确处理大多数PureBasic语法结构，包括过程定义、变量声明和内置函数。