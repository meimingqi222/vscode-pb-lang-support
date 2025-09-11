; PureBasic 数据结构和算法测试
; 用于测试复杂的数据结构和算法功能

; 链表节点结构
Structure ListNode
    value.i
    *next.ListNode
EndStructure

; 二叉树节点结构
Structure TreeNode
    value.i
    *left.TreeNode
    *right.TreeNode
EndStructure

; 学生信息结构
Structure Student
    id.i
    name.s
    age.i
    grade.f
    subjects.s[10]
EndStructure

; 全局变量
Global NewList students.Student()
Global NewList linkedList.ListNode()
Global *root.TreeNode = #Null

; 链表操作过程
Procedure AddToLinkedList(value.i)
    Protected *newNode.ListNode = AllocateMemory(SizeOf(ListNode))
    If *newNode
        *newNode\value = value
        *newNode\next = #Null
        
        If ListSize(linkedList) = 0
            AddElement(linkedList())
            linkedList() = *newNode
        Else
            LastElement(linkedList())
            linkedList()\next = *newNode
            AddElement(linkedList())
            linkedList() = *newNode
        EndIf
    EndIf
EndProcedure

Procedure PrintLinkedList()
    ForEach linkedList()
        Debug Str(linkedList()\value) + " -> "
    Next
    Debug "NULL"
EndProcedure

; 二叉树操作过程
Procedure InsertTreeNode(*treeNode.TreeNode, value.i)
    If *treeNode = #Null
        *treeNode = AllocateMemory(SizeOf(TreeNode))
        If *treeNode
            *treeNode\value = value
            *treeNode\left = #Null
            *treeNode\right = #Null
        EndIf
        ProcedureReturn *treeNode
    EndIf
    
    If value < *treeNode\value
        *treeNode\left = InsertTreeNode(*treeNode\left, value)
    ElseIf value > *treeNode\value
        *treeNode\right = InsertTreeNode(*treeNode\right, value)
    EndIf
    
    ProcedureReturn *treeNode
EndProcedure

Procedure InOrderTraversal(*node.TreeNode)
    If *node <> #Null
        InOrderTraversal(*node\left)
        Debug Str(*node\value)
        InOrderTraversal(*node\right)
    EndIf
EndProcedure

; 学生信息管理
Procedure AddStudent(id.i, name.s, age.i, grade.f)
    AddElement(students())
    students()\id = id
    students()\name = name
    students()\age = age
    students()\grade = grade
EndProcedure

Procedure PrintStudents()
    Debug "Student List:"
    Debug "ID | Name | Age | Grade"
    Debug "------------------------"
    ForEach students()
        Debug Str(students()\id) + " | " + students()\name + " | " + Str(students()\age) + " | " + StrF(students()\grade, 2)
    Next
EndProcedure

Procedure FindStudentById(id.i)
    ForEach students()
        If students()\id = id
            ProcedureReturn @students()
        EndIf
    Next
    ProcedureReturn #Null
EndProcedure

; 排序算法
Procedure BubbleSort(Array arr.i(1))
    Protected i.i, j.i, temp.i
    Protected n.i = ArraySize(arr())
    
    For i = 0 To n - 1
        For j = 0 To n - i - 2
            If arr(j) > arr(j + 1)
                temp = arr(j)
                arr(j) = arr(j + 1)
                arr(j + 1) = temp
            EndIf
        Next j
    Next i
EndProcedure

Procedure PrintArray(Array arr.i(1))
    Protected i.i
    For i = 0 To ArraySize(arr())
        Debug Str(arr(i))
    Next i
EndProcedure

; 搜索算法
Procedure.i BinarySearch(Array arr.i(1), target.i)
    Protected left.i = 0
    Protected right.i = ArraySize(arr())
    Protected mid.i
    
    While left <= right
        mid = (left + right) / 2
        If arr(mid) = target
            ProcedureReturn mid
        ElseIf arr(mid) < target
            left = mid + 1
        Else
            right = mid - 1
        EndIf
    Wend
    
    ProcedureReturn -1
EndProcedure

; 字符串处理函数
Procedure.s ReverseString(text.s)
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

; 数学计算函数
Procedure.i Factorial(n.i)
    If n <= 1
        ProcedureReturn 1
    EndIf
    ProcedureReturn n * Factorial(n - 1)
EndProcedure

Procedure.i Fibonacci(n.i)
    If n <= 1
        ProcedureReturn n
    EndIf
    ProcedureReturn Fibonacci(n - 1) + Fibonacci(n - 2)
EndProcedure

Procedure.b IsPrime(n.i)
    Protected i.i
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

; 主测试程序
Procedure Main()
    ; 测试链表
    Debug "=== Linked List Test ==="
    AddToLinkedList(10)
    AddToLinkedList(20)
    AddToLinkedList(30)
    AddToLinkedList(40)
    PrintLinkedList()
    Debug ""
    
    ; 测试二叉树
    Debug "=== Binary Tree Test ==="
    *root = InsertTreeNode(*root, 50)
    InsertTreeNode(*root, 30)
    InsertTreeNode(*root, 70)
    InsertTreeNode(*root, 20)
    InsertTreeNode(*root, 40)
    InsertTreeNode(*root, 60)
    InsertTreeNode(*root, 80)
    Debug "In-order traversal:"
    InOrderTraversal(*root)
    Debug ""
    
    ; 测试学生信息
    Debug "=== Student Management Test ==="
    AddStudent(1, "Alice", 20, 85.5)
    AddStudent(2, "Bob", 21, 78.2)
    AddStudent(3, "Charlie", 22, 92.1)
    AddStudent(4, "Diana", 19, 88.7)
    PrintStudents()
    Debug ""
    
    ; 测试排序
    Debug "=== Sorting Test ==="
    Dim arr.i(9)
    For i = 0 To 9
        arr(i) = Random(100)
    Next i
    Debug "Original array:"
    PrintArray(arr())
    BubbleSort(arr())
    Debug "Sorted array:"
    PrintArray(arr())
    Debug ""
    
    ; 测试搜索
    Debug "=== Search Test ==="
    Debug "Searching for 42:"
    Dim searchArr.i(9)
    For i = 0 To 9
        searchArr(i) = (i + 1) * 10
    Next i
    Debug "Array:"
    PrintArray(searchArr())
    result = BinarySearch(searchArr(), 42)
    If result >= 0
        Debug "Found 42 at index: " + Str(result)
    Else
        Debug "42 not found"
    EndIf
    Debug ""
    
    ; 测试字符串处理
    Debug "=== String Processing Test ==="
    testString.s = "Hello, World!"
    Debug "Original: " + testString
    Debug "Reversed: " + ReverseString(testString)
    Debug "Is palindrome: " + Str(IsPalindrome(testString))
    Debug "Is 'racecar' palindrome: " + Str(IsPalindrome("racecar"))
    Debug ""
    
    ; 测试数学函数
    Debug "=== Math Functions Test ==="
    Debug "Factorial of 5: " + Str(Factorial(5))
    Debug "Fibonacci of 10: " + Str(Fibonacci(10))
    Debug "Is 17 prime: " + Str(IsPrime(17))
    Debug "Is 15 prime: " + Str(IsPrime(15))
    
    Debug ""
    Debug "All tests completed successfully!"
EndProcedure

; 运行主程序
Main()