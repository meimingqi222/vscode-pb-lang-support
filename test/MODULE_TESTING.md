# PureBasic Module LSP功能测试指南

## 新增的Module支持功能

我已经为PureBasic Module添加了完整的LSP支持，包括：

### ✅ 语法高亮支持
- Module/EndModule 关键字高亮
- DeclareModule/EndDeclareModule 关键字高亮
- UseModule/UnuseModule 关键字高亮
- EnableExplicit/DisableExplicit 关键字高亮
- Module代码折叠支持

### ✅ 智能符号解析
- Module内部符号识别（过程、变量、常量、结构体、接口）
- Module作用域管理
- 跨文件符号查找
- Module符号类型分类

### ✅ 增强的LSP功能
- **转到定义 (F12)**: 支持跳转到Module内部的符号定义
- **查找引用 (Shift+F12)**: 跨文件查找Module符号的所有引用
- **悬停提示**: 显示Module符号的详细信息（类型、所属Module、定义）
- **自动补全**: 智能补全Module内部的符号，显示Module信息

## 测试方法

### 1. 开发模式测试
1. 在VSCode中打开 `vscode-purebasic` 文件夹
2. 按 `F5` 启动调试模式
3. 在新窗口中打开 `test/samples/test_modules.pb`

### 2. 测试Module功能

#### 转到定义测试 (F12)
1. 打开 `test_modules.pb`
2. 找到调用Module过程的地方，例如：
   ```purebasic
   Debug "5! = " + Str(Factorial(5))
   ```
3. 将光标放在 `Factorial` 上
4. 按 `F12` - 应该跳转到 `MathTools` Module中的 `Factorial` 过程定义

#### 查找引用测试 (Shift+F12)
1. 将光标放在Module名称上，例如 `MathTools`
2. 按 `Shift+F12` - 应该显示所有使用该Module的位置
3. 将光标放在Module内部过程上，例如 `Reverse`
4. 按 `Shift+F12` - 应该显示所有调用该过程的位置

#### 悬停提示测试
1. 将鼠标悬停在Module内部符号上：
   - `Factorial` - 应该显示过程信息和所属Module
   - `testString` - 应该显示变量信息
   - `#PI` - 应该显示常量信息
   - `MathTools` - 应该显示Module名称

#### 自动补全测试
1. 在UseModule代码块中输入部分符号名：
   ```purebasic
   UseModule MathTools
   Debug Fac  ; 这里应该显示Factorial等自动补全选项
   ```
2. 检查自动补全是否显示Module信息

### 3. 跨文件测试
1. 创建多个包含Module的 `.pb` 文件
2. 在一个文件中定义Module，在另一个文件中使用
3. 测试跨文件的转到定义和查找引用功能

## 测试用例

### Module定义和使用
```purebasic
Module MathTools
    Procedure.i Factorial(n.i)
        If n <= 1
            ProcedureReturn 1
        EndIf
        ProcedureReturn n * Factorial(n - 1)
    EndProcedure
EndModule

UseModule MathTools
Debug "5! = " + Str(Factorial(5))  ; F12应该跳转到Module中的定义
UnuseModule MathTools
```

### 跨文件Module引用
**文件1: math_module.pb**
```purebasic
Module MathTools
    Procedure.i Add(a.i, b.i)
        ProcedureReturn a + b
    EndProcedure
EndModule
```

**文件2: main.pb**
```purebasic
XIncludeFile "math_module.pb"

UseModule MathTools
Debug Add(5, 3)  ; F12应该跳转到另一个文件中的定义
UnuseModule MathTools
```

## 预期的调试日志

在输出面板中应该看到类似这样的日志：

```
Updated symbol table for file:///.../test_modules.pb: 45 symbols found
Definition requested for: {"textDocument":{"uri":"..."},"position":{"line":120,"character":25}}
Looking for definition of: Factorial
Found definition in current document: Procedure.i Factorial(n.i)
```

## 预期的悬停提示

鼠标悬停在Module符号上时应该显示：

```
**Factorial**

**Type:** Procedure

**Module:** MathTools

**Definition:**
`Procedure.i Factorial(n.i)`

**Location:** Line 15
```

## 功能特点

### 1. 智能符号解析
- 自动识别Module作用域
- 区分不同Module中的同名符号
- 支持嵌套Module结构

### 2. 跨文件支持
- 支持跨文件的Module符号查找
- 自动解析XIncludeFile引用的文件
- 工作区范围内的符号索引

### 3. 丰富的符号类型
- 过程 (Procedure)
- 变量 (Global/Protected/Static)
- 常量 (#define)
- 结构体 (Structure)
- 接口 (Interface)

### 4. 实时更新
- 文件内容变化时自动更新符号表
- 文件打开/关闭时管理符号表
- 支持增量更新

## 故障排除

如果Module功能不工作，请：

1. **检查语法**: 确保Module语法正确
2. **查看日志**: 检查输出面板中的调试信息
3. **重启扩展**: 重新按F5启动调试模式
4. **确认文件类型**: 确保 `.pb` 文件被识别为PureBasic语言

现在PureBasic Module具有完整的IDE支持，包括智能代码补全、导航和文档功能！