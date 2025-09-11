; PureBasic Module测试文件
; 用于测试Module相关的LSP功能

; 常量定义
#PI = 3.14159265
#MAX_SIZE = 1000
#VERSION = "1.0.0"

; 全局变量
Global g_appName.s = "PureBasic Module Test"
Global g_version.i = 1
Global g_isRunning.b = #True

; 数学工具模块
Module MathTools
    ; 模块内部变量
    ModulePrivate precision.i = 6
    
    ; 模块内部过程
    Procedure.i Factorial(n.i)
        If n <= 1
            ProcedureReturn 1
        EndIf
        ProcedureReturn n * Factorial(n - 1)
    EndProcedure
    
    Procedure.f SquareRoot(x.f)
        ProcedureReturn Sqr(x)
    EndProcedure
    
    Procedure.f Power(base.f, exponent.f)
        ProcedureReturn Pow(base, exponent)
    EndProcedure
    
    Procedure.i IsPrime(n.i)
        If n <= 1
            ProcedureReturn #False
        EndIf
        If n = 2
            ProcedureReturn #True
        EndIf
        If n % 2 = 0
            ProcedureReturn #False
        EndIf
        
        For i = 3 To Sqr(n) Step 2
            If n % i = 0
                ProcedureReturn #False
            EndIf
        Next i
        
        ProcedureReturn #True
    EndProcedure
    
    Procedure.i Fibonacci(n.i)
        If n <= 1
            ProcedureReturn n
        EndIf
        ProcedureReturn Fibonacci(n - 1) + Fibonacci(n - 2)
    EndProcedure
    
    Procedure.i GCD(a.i, b.i)
        If b = 0
            ProcedureReturn a
        EndIf
        ProcedureReturn GCD(b, a % b)
    EndProcedure
    
    Procedure.i LCM(a.i, b.i)
        ProcedureReturn (a * b) / GCD(a, b)
    EndProcedure
EndModule

; 字符串工具模块
Module StringTools
    Procedure.s Reverse(text.s)
        Protected result.s = ""
        Protected i.i
        Protected len.i = Len(text)
        
        For i = len - 1 To 0 Step -1
            result + Mid(text, i + 1, 1)
        Next i
        
        ProcedureReturn result
    EndProcedure
    
    Procedure.b IsPalindrome(text.s)
        Protected left.i = 0
        Protected right.i = Len(text) - 1
        
        While left < right
            If Mid(text, left + 1, 1) <> Mid(text, right + 1, 1)
                ProcedureReturn #False
            EndIf
            left + 1
            right - 1
        Wend
        
        ProcedureReturn #True
    EndProcedure
    
    Procedure.s ToUpperCase(text.s)
        Protected result.s = ""
        Protected i.i
        Protected char.c
        
        For i = 1 To Len(text)
            char = Asc(Mid(text, i, 1))
            If char >= 97 And char <= 122
                result + Chr(char - 32)
            Else
                result + Chr(char)
            EndIf
        Next i
        
        ProcedureReturn result
    EndProcedure
    
    Procedure.s ToLowerCase(text.s)
        Protected result.s = ""
        Protected i.i
        Protected char.c
        
        For i = 1 To Len(text)
            char = Asc(Mid(text, i, 1))
            If char >= 65 And char <= 90
                result + Chr(char + 32)
            Else
                result + Chr(char)
            EndIf
        Next i
        
        ProcedureReturn result
    EndProcedure
    
    Procedure.s Trim(text.s)
        Protected start.i = 1
        Protected end.i = Len(text)
        
        ; 找到第一个非空格字符
        While start <= end And Mid(text, start, 1) = " "
            start + 1
        Wend
        
        ; 找到最后一个非空格字符
        While end >= start And Mid(text, end, 1) = " "
            end - 1
        Wend
        
        If start > end
            ProcedureReturn ""
        EndIf
        
        ProcedureReturn Mid(text, start, end - start + 1)
    EndProcedure
    
    Procedure.i CountOccurrences(text.s, substring.s)
        Protected count.i = 0
        Protected pos.i = 1
        Protected len.i = Len(substring)
        
        While pos <= Len(text) - len + 1
            If Mid(text, pos, len) = substring
                count + 1
                pos + len
            Else
                pos + 1
            EndIf
        Wend
        
        ProcedureReturn count
    EndProcedure
EndModule

; 数组工具模块
Module ArrayTools
    Procedure.i FindMin(Array arr.i(1))
        Protected min.i = arr(0)
        Protected i.i
        
        For i = 1 To ArraySize(arr())
            If arr(i) < min
                min = arr(i)
            EndIf
        Next i
        
        ProcedureReturn min
    EndProcedure
    
    Procedure.i FindMax(Array arr.i(1))
        Protected max.i = arr(0)
        Protected i.i
        
        For i = 1 To ArraySize(arr())
            If arr(i) > max
                max = arr(i)
            EndIf
        Next i
        
        ProcedureReturn max
    EndProcedure
    
    Procedure.f CalculateAverage(Array arr.i(1))
        Protected sum.i = 0
        Protected i.i
        
        For i = 0 To ArraySize(arr())
            sum + arr(i)
        Next i
        
        ProcedureReturn sum / (ArraySize(arr()) + 1)
    EndProcedure
    
    Procedure.b Contains(Array arr.i(1), value.i)
        Protected i.i
        
        For i = 0 To ArraySize(arr())
            If arr(i) = value
                ProcedureReturn #True
            EndIf
        Next i
        
        ProcedureReturn #False
    EndProcedure
    
    Procedure.i CountOccurrences(Array arr.i(1), value.i)
        Protected count.i = 0
        Protected i.i
        
        For i = 0 To ArraySize(arr())
            If arr(i) = value
                count + 1
            EndIf
        Next i
        
        ProcedureReturn count
    EndProcedure
    
    Procedure BubbleSort(Array arr.i(1))
        Protected i.i, j.i, temp.i
        Protected n.i = ArraySize(arr())
        
        For i = 0 To n - 1
            For j = 0 To n - i - 1
                If arr(j) > arr(j + 1)
                    temp = arr(j)
                    arr(j) = arr(j + 1)
                    arr(j + 1) = temp
                EndIf
            Next j
        Next i
    EndProcedure
EndModule

; 使用模块的示例
Procedure TestModules()
    ; 使用数学工具模块
    UseModule MathTools
    
    Debug "=== Math Tools Test ==="
    Debug "5! = " + Str(Factorial(5))
    Debug "Square root of 16 = " + StrF(SquareRoot(16))
    Debug "2^8 = " + StrF(Power(2, 8))
    Debug "Is 17 prime? " + Str(IsPrime(17))
    Debug "Fibonacci(10) = " + Str(Fibonacci(10))
    Debug "GCD(48, 18) = " + Str(GCD(48, 18))
    Debug "LCM(12, 18) = " + Str(LCM(12, 18))
    
    UnuseModule MathTools
    
    ; 使用字符串工具模块
    UseModule StringTools
    
    Debug ""
    Debug "=== String Tools Test ==="
    Protected testString.s = "Hello, World!"
    Debug "Original: " + testString
    Debug "Reversed: " + Reverse(testString)
    Debug "Is palindrome: " + Str(IsPalindrome(testString))
    Debug "Upper case: " + ToUpperCase(testString)
    Debug "Lower case: " + ToLowerCase(testString)
    Debug "Trimmed: '" + Trim("  " + testString + "  ") + "'"
    Debug "Count 'l': " + Str(CountOccurrences(testString, "l"))
    
    UnuseModule StringTools
    
    ; 使用数组工具模块
    UseModule ArrayTools
    
    Debug ""
    Debug "=== Array Tools Test ==="
    Dim testArray.i(9)
    Protected i.i
    
    For i = 0 To 9
        testArray(i) = Random(100)
    Next i
    
    Debug "Array: " + Str(testArray(0)) + ", " + Str(testArray(1)) + ", " + Str(testArray(2)) + ", ..."
    Debug "Min: " + Str(FindMin(testArray()))
    Debug "Max: " + Str(FindMax(testArray()))
    Debug "Average: " + StrF(CalculateAverage(testArray()))
    Debug "Contains 42: " + Str(Contains(testArray(), 42))
    
    ; 测试排序
    Debug "Before sort: " + Str(testArray(0)) + ", " + Str(testArray(1)) + ", " + Str(testArray(2))
    BubbleSort(testArray())
    Debug "After sort: " + Str(testArray(0)) + ", " + Str(testArray(1)) + ", " + Str(testArray(2))
    
    UnuseModule ArrayTools
EndProcedure

; 主程序
Procedure Main()
    Debug "PureBasic Module Test Program"
    Debug "============================"
    Debug "App Name: " + g_appName
    Debug "Version: " + Str(g_version)
    Debug "PI = " + StrF(#PI)
    Debug "MAX_SIZE = " + Str(#MAX_SIZE)
    Debug ""
    
    TestModules()
    
    Debug ""
    Debug "Module test completed successfully!"
EndProcedure

; 运行主程序
Main()