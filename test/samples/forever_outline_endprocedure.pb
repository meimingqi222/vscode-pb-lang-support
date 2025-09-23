; PureBasic test sample for ForEver, EndProcedure highlighting, and Outline within Module/EndModule

; 1) Repeat / ForEver recognition + formatting/indent
Repeat
    Debug "a"
ForEver
Debug "after forever should be left-aligned"

; Variation: single-line with colons
Repeat : Debug "inline" : ForEver

; Variation: trailing comments
Repeat ; comment after repeat
    Debug "ok"
ForEver ; trailing comment should still close Repeat

; Control: Repeat/Until
Repeat
    Break
Until #True

; Single-line While/Wend
While #True : Debug "loop once" : Wend

; Single-line For/Next
For i = 0 To 1 : Debug i : Next i

; Single-line Select/EndSelect
Select 1 : EndSelect

; Single-line With/EndWith
Structure Tmp
  a.i
EndStructure
Define t.Tmp
With t : EndWith

; 2) Outline + EndProcedure highlighting inside modules
Module M1
    #C1 = 1

    Procedure.i Add(a.i, b.i)
        Protected.i s = a + b
        ProcedureReturn s
    EndProcedure

    Procedure SayHello()
        Debug "Hello from M1"
    EndProcedure
EndModule

Module M2
    #C2 = 2

    Structure Person
        *name.s
        age.i
    EndStructure

    Interface Greeter
        Greet()
    EndInterface

    Enumeration
        #EnumA
        #EnumB
    EndEnumeration

    Procedure.d Mul(x.d, y.d)
        ProcedureReturn x * y
    EndProcedure
EndModule

; 3) Top-level procedure to check EndProcedure highlighting and outline sorting
Procedure Show()
    Debug "Top level"
EndProcedure

; 4) Top-level constant for outline selection test
#TOP = 42

; 5) Single-line Procedure/EndProcedure (rare but supported)
Procedure SingleLine() : EndProcedure

; 6) Single-line Module/EndModule (rare)
Module Quick : EndModule

; 7) ProcedureC/DLL variants
ProcedureC.i CStyleAdd(a.i, b.i)
  ProcedureReturn a + b
EndProcedure

ProcedureDLL.i DllStyleMul(a.i, b.i)
  ProcedureReturn a * b
EndProcedure
