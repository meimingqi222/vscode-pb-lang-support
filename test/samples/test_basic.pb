; PureBasic 基础语法测试文件
; 用于测试VSCode插件的各种功能

; 全局变量声明
Global window.i = 0
Global event.i = 0
Global message.s = "Hello, PureBasic!"

; 数据类型测试
Global integerVar.i = 42
Global stringVar.s = "Test String"
Global floatVar.f = 3.14159
Global longVar.l = 123456789
Global byteVar.b = 255

; 数组测试
Dim intArray.i(10)
Dim stringArray.s(5)

; 结构体定义
Structure Person
    name.s
    age.i
    height.f
EndStructure

; 枚举定义
Enumeration
    #STATE_IDLE
    #STATE_RUNNING
    #STATE_PAUSED
    #STATE_STOPPED
EndEnumeration

; 简单过程定义
Procedure.i AddNumbers(a.i, b.i)
    ProcedureReturn a + b
EndProcedure

; 带参数的过程
Procedure.s CreateGreeting(name.s, age.i)
    Static greeting.s
    greeting = "Hello, " + name + "! You are " + Str(age) + " years old."
    ProcedureReturn greeting
EndProcedure

; 带返回值的过程
Procedure.f CalculateCircleArea(radius.f)
    Define area.f = #PI * radius * radius
    ProcedureReturn area
EndProcedure

; 条件语句测试
If integerVar > 0
    Debug "Positive number"
ElseIf integerVar < 0
    Debug "Negative number"
Else
    Debug "Zero"
EndIf

; 循环测试
For i = 1 To 10
    intArray(i) = i * 2
Next i

; While循环
While window < 100
    window + 1
Wend

; Repeat循环
Repeat
    event + 1
Until event >= 5

; Select语句
Select integerVar
    Case 1
        Debug "Case 1"
    Case 2
        Debug "Case 2"
    Default
        Debug "Default case"
EndSelect

; 函数调用测试
Debug AddNumbers(5, 3)
Debug CreateGreeting("Alice", 25)
Debug CalculateCircleArea(5.0)

; 内置函数测试
Debug Str(integerVar)
Debug Val("123")
Debug Len(stringVar)
Debug Left(stringVar, 3)
Debug Right(stringVar, 3)
Debug Mid(stringVar, 2, 3)

; 文件操作测试
If CreateFile(0, "test.txt")
    WriteStringN(0, "This is a test file")
    WriteStringN(0, "Created for testing PureBasic syntax")
    CloseFile(0)
EndIf

; 窗口创建测试（如果支持GUI）
CompilerIf #PB_Compiler_Executable
    If OpenWindow(0, 0, 0, 400, 300, "Test Window", #PB_Window_SystemMenu | #PB_Window_ScreenCentered)
        TextGadget(0, 10, 10, 200, 20, "PureBasic Test")
        ButtonGadget(1, 10, 40, 100, 30, "Click Me")
        
        Repeat
            event = WaitWindowEvent()
            If event = #PB_Event_Gadget
                If EventGadget() = 1
                    MessageRequester("Info", "Button clicked!")
                EndIf
            EndIf
        Until event = #PB_Event_CloseWindow
        
        CloseWindow(0)
    EndIf
CompilerEndIf

; 测试各种语法结构
With person
    \name = "John Doe"
    \age = 30
    \height = 1.75
EndWith

; 列表操作
NewList stringList.s()
AddElement(stringList())
stringList() = "First item"
AddElement(stringList())
stringList() = "Second item"

ForEach stringList()
    Debug stringList()
Next

; 错误测试（用于测试诊断功能）
; 故意写一些有问题的代码
If integerVar > 0 Then ; 缺少Then
    Debug "This should trigger a warning"
EndIf

Procedure TestProcedure ; 缺少参数括号
    Debug "This should trigger a warning"
EndProcedure

; 结束
Debug "PureBasic test file completed!"