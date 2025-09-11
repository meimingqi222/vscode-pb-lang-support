; PureBasic GUI测试文件
; 用于测试GUI相关函数的语法高亮和自动补全

; 包含文件
XIncludeFile "test_basic.pb"

; 常量定义
#WINDOW_WIDTH = 800
#WINDOW_HEIGHT = 600
#WINDOW_TITLE = "PureBasic GUI Test"

; Gadget ID常量
#GADGET_TEXT = 1
#GADGET_BUTTON = 2
#GADGET_INPUT = 3
#GADGET_LIST = 4
#GADGET_COMBO = 5
#GADGET_CHECK = 6
#GADGET_OPTION = 7
#GADGET_PROGRESS = 8
#GADGET_SCROLLER = 9
#GADGET_CANVAS = 10

; 全局变量
Global window.i
Global event.i
Global quit.b = #False

; 过程定义
Procedure OpenMainWindow()
    window = OpenWindow(0, 0, 0, #WINDOW_WIDTH, #WINDOW_HEIGHT, #WINDOW_TITLE, 
                        #PB_Window_SystemMenu | #PB_Window_MinimizeGadget | #PB_Window_MaximizeGadget | #PB_Window_SizeGadget | #PB_Window_ScreenCentered)
    
    If window
        ; 创建gadget列表
        If CreateGadgetList(WindowID(0))
            ; 文本标签
            TextGadget(#GADGET_TEXT, 10, 10, 200, 20, "PureBasic GUI Test")
            
            ; 按钮
            ButtonGadget(#GADGET_BUTTON, 10, 40, 100, 30, "Click Me")
            
            ; 输入框
            StringGadget(#GADGET_INPUT, 10, 80, 200, 25, "Type here...")
            
            ; 列表框
            ListIconGadget(#GADGET_LIST, 10, 120, 200, 100, "Items", 100)
            AddGadgetItem(#GADGET_LIST, -1, "Item 1")
            AddGadgetItem(#GADGET_LIST, -1, "Item 2")
            AddGadgetItem(#GADGET_LIST, -1, "Item 3")
            
            ; 组合框
            ComboBoxGadget(#GADGET_COMBO, 10, 230, 200, 25)
            AddGadgetItem(#GADGET_COMBO, "Option 1")
            AddGadgetItem(#GADGET_COMBO, "Option 2")
            AddGadgetItem(#GADGET_COMBO, "Option 3")
            SetGadgetState(#GADGET_COMBO, 0)
            
            ; 复选框
            CheckBoxGadget(#GADGET_CHECK, 10, 270, 150, 20, "Enable Feature")
            
            ; 单选按钮
            OptionGadget(#GADGET_OPTION, 10, 300, 150, 20, "Radio Button")
            
            ; 进度条
            ProgressBarGadget(#GADGET_PROGRESS, 10, 330, 200, 20, 0, 100)
            SetGadgetState(#GADGET_PROGRESS, 50)
            
            ; 滚动条
            ScrollBarGadget(#GADGET_SCROLLER, 10, 360, 200, 20, 0, 100, 50)
            
            ; 画布
            CanvasGadget(#GADGET_CANVAS, 10, 390, 200, 150)
            
            ; 绘制一些图形
            If StartDrawing(CanvasOutput(#GADGET_CANVAS))
                Box(0, 0, 200, 150, RGB(255, 255, 255))
                Circle(100, 75, 50, RGB(255, 0, 0))
                Line(0, 0, 200, 150, RGB(0, 0, 255))
                StopDrawing()
            EndIf
        EndIf
        
        ProcedureReturn #True
    EndIf
    
    ProcedureReturn #False
EndProcedure

; 事件处理过程
Procedure HandleEvents()
    event = WaitWindowEvent()
    
    Select event
        Case #PB_Event_CloseWindow
            quit = #True
            
        Case #PB_Event_Gadget
            Select EventGadget()
                Case #GADGET_BUTTON
                    MessageRequester("Button", "Button clicked!", #MB_OK | #MB_ICONINFORMATION)
                    
                Case #GADGET_INPUT
                    Debug "Input changed: " + GetGadgetText(#GADGET_INPUT)
                    
                Case #GADGET_LIST
                    If EventType() = #PB_EventType_Change
                        Debug "List selection changed: " + GetGadgetState(#GADGET_LIST)
                    EndIf
                    
                Case #GADGET_COMBO
                    If EventType() = #PB_EventType_Change
                        Debug "Combo selection changed: " + GetGadgetState(#GADGET_COMBO)
                    EndIf
                    
                Case #GADGET_CHECK
                    Debug "Checkbox state: " + GetGadgetState(#GADGET_CHECK)
                    
                Case #GADGET_SCROLLER
                    Debug "Scroller position: " + GetGadgetState(#GADGET_SCROLLER)
                    SetGadgetState(#GADGET_PROGRESS, GetGadgetState(#GADGET_SCROLLER))
                    
                Case #GADGET_CANVAS
                    If EventType() = #PB_EventType_LeftClick
                        Debug "Canvas clicked at: " + Str(GetGadgetAttribute(#GADGET_CANVAS, #PB_Canvas_MouseX)) + "," + Str(GetGadgetAttribute(#GADGET_CANVAS, #PB_Canvas_MouseY))
                    EndIf
            EndSelect
            
        Case #PB_Event_Menu
            Debug "Menu event: " + EventMenu()
            
        Case #PB_Event_Repaint
            If EventGadget() = #GADGET_CANVAS
                If StartDrawing(CanvasOutput(#GADGET_CANVAS))
                    Box(0, 0, 200, 150, RGB(255, 255, 255))
                    Circle(100, 75, 50, RGB(255, 0, 0))
                    Line(0, 0, 200, 150, RGB(0, 0, 255))
                    StopDrawing()
                EndIf
            EndIf
    EndSelect
EndProcedure

; 主程序
If OpenMainWindow()
    ; 主循环
    Repeat
        HandleEvents()
        Delay(10) ; 减少CPU使用率
    Until quit
    
    ; 清理资源
    CloseWindow(0)
Else
    MessageRequester("Error", "Failed to create window!", #MB_OK | #MB_ICONERROR)
EndIf

End