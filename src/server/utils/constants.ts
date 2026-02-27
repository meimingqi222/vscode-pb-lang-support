/**
 * PureBasic语言常量定义
 * 包含关键字、内置类型、内置函数等
 */

export const keywords = [
    'If', 'Then', 'Else', 'ElseIf', 'EndIf', 'For', 'Next', 'Step', 'To',
    'While', 'Wend', 'Repeat', 'Until', 'ForEver', 'Select', 'Case', 'Default', 'EndSelect',
    'Break', 'Continue', 'Goto', 'Gosub', 'Return', 'End',
    'Procedure', 'ProcedureC', 'ProcedureDLL', 'ProcedureCDLL',
    'EndProcedure', 'ProcedureReturn', 'Declare', 'DeclareC', 'DeclareDLL', 'DeclareCDLL', 'Prototype', 'Interface', 'EndInterface',
    'Structure', 'EndStructure', 'Enumeration', 'EndEnumeration', 'Data', 'Read',
    'Restore', 'NewList', 'AddElement', 'InsertElement', 'DeleteElement',
    'ClearList', 'ListIndex', 'ResetList', 'NextElement', 'PreviousElement',
    'ForEach', 'With', 'EndWith', 'Module', 'EndModule', 'DeclareModule',
    'EndDeclareModule', 'UseModule', 'UnuseModule', 'EnableExplicit', 'DisableExplicit'
];

export const types = [
    'Integer', 'Long', 'Word', 'Byte', 'Character', 'String', 'FixedString',
    'Float', 'Double', 'Quad', 'Ascii', 'Unicode'
];

export const builtInFunctions = [
    'OpenWindow', 'CreateGadgetList', 'EventWindow', 'EventGadget', 'EventMenu',
    'WaitWindowEvent', 'WindowEvent', 'SetActiveWindow', 'CloseWindow', 'WindowID',
    'WindowOutput', 'WindowX', 'WindowY', 'WindowWidth', 'WindowHeight',
    'DesktopWidth', 'DesktopHeight', 'DesktopDepth', 'DesktopFrequency', 'Delay',
    'CountProgramParameters', 'ProgramParameter', 'RunProgram', 'OpenFile',
    'ReadFile', 'WriteFile', 'CloseFile', 'FileSeek', 'FileSize', 'Eof',
    'ReadString', 'WriteString', 'ReadCharacter', 'WriteCharacter', 'ReadByte',
    'WriteByte', 'ReadWord', 'WriteWord', 'ReadLong', 'WriteLong', 'ReadQuad',
    'WriteQuad', 'ReadFloat', 'WriteFloat', 'ReadDouble', 'WriteDouble',
    'CreateDirectory', 'DeleteFile', 'CopyFile', 'RenameFile', 'DirectoryEntry',
    'DirectoryEntryType', 'DirectoryEntryName', 'DirectoryEntrySize',
    'DirectoryEntryDate', 'DirectoryEntryAttributes', 'NextDirectoryEntry',
    'FinishDirectory', 'ExamineDirectory', 'SetCurrentDirectory',
    'GetCurrentDirectory', 'CreateFile', 'FileBuffers', 'FileID', 'FileError',
    'MessageRequester', 'InputRequester', 'OpenFileRequester', 'SaveFileRequester',
    'PathRequester', 'ColorRequester', 'FontRequester'
];

// 数组函数
export const arrayFunctions = [
    'ArraySize', 'FreeArray', 'ClearArray', 'CopyArray', 'ResizeArray',
    'SortArray', 'SortStructuredArray', 'RandomizeArray'
];

// 链表函数
export const listFunctions = [
    'NewList', 'AddElement', 'InsertElement', 'DeleteElement', 'ClearList',
    'ListIndex', 'ListSize', 'ResetList', 'NextElement', 'PreviousElement',
    'FirstElement', 'LastElement', 'SelectElement', 'ChangeCurrentElement',
    'MoveElement', 'SwapElements', 'SortList', 'SortStructuredList',
    'PushListPosition', 'PopListPosition', 'CopyList', 'FreeList'
];

// Map函数
export const mapFunctions = [
    'NewMap', 'DeleteMapElement', 'ClearMap', 'CopyMap', 'FreeMap',
    'MapSize', 'AddMapElement', 'FindMapElement', 'NextMapElement',
    'PreviousMapElement', 'ResetMap'
];

// Windows API函数
export const windowsApiFunctions = [
    'MessageBox_', 'GetWindowText_', 'SetWindowText_', 'FindWindow_',
    'GetDesktopWindow_', 'GetForegroundWindow_', 'SetForegroundWindow_',
    'ShowWindow_', 'MoveWindow_', 'GetWindowRect_', 'SetWindowPos_',
    'CreateFile_', 'ReadFile_', 'WriteFile_', 'CloseHandle_',
    'GetCurrentDirectory_', 'SetCurrentDirectory_', 'CreateDirectory_',
    'DeleteFile_', 'CopyFile_', 'MoveFile_', 'FindFirstFile_', 'FindNextFile_',
    'RegOpenKeyEx_', 'RegQueryValueEx_', 'RegSetValueEx_', 'RegCloseKey_'
];

// 图形和游戏相关函数
export const graphicsFunctions = [
    'InitSprite', 'LoadSprite', 'FreeSprite', 'SpriteWidth', 'SpriteHeight',
    'DisplaySprite', 'DisplayTransparentSprite', 'RotateSprite', 'ZoomSprite',
    'OpenScreen', 'CloseScreen', 'FlipBuffers', 'ClearScreen', 'ScreenOutput',
    'Point', 'Line', 'Box', 'Circle', 'Ellipse', 'Plot', 'RGB', 'Red', 'Green', 'Blue',
    'LoadImage', 'SaveImage', 'CreateImage', 'FreeImage', 'ImageOutput',
    'ImageWidth', 'ImageHeight', 'GrabImage', 'DrawImage', 'DrawAlphaImage',
    'InitSound', 'LoadSound', 'FreeSound', 'PlaySound', 'StopSound', 'SoundStatus',
    'SoundVolume', 'SetSoundFrequency', 'GetSoundPosition', 'SetSoundPosition'
];

// 网络函数
export const networkFunctions = [
    'InitNetwork', 'CreateNetworkServer', 'CreateNetworkClient', 'CloseNetworkServer',
    'CloseNetworkClient', 'NetworkServerEvent', 'NetworkClientEvent',
    'SendNetworkString', 'ReceiveNetworkString', 'SendNetworkData', 'ReceiveNetworkData',
    'IPString', 'HostIP', 'GetClientIP'
];

// 数据库函数
export const databaseFunctions = [
    'OpenDatabase', 'CloseDatabase', 'DatabaseQuery', 'NextDatabaseRow',
    'GetDatabaseString', 'GetDatabaseLong', 'GetDatabaseFloat', 'GetDatabaseDouble',
    'SetDatabaseString', 'SetDatabaseLong', 'SetDatabaseFloat', 'SetDatabaseDouble',
    'DatabaseUpdate', 'DatabaseColumnName', 'DatabaseColumns'
];

// 线程函数
export const threadFunctions = [
    'CreateThread', 'WaitThread', 'KillThread', 'ThreadID', 'IsThread',
    'CreateMutex', 'LockMutex', 'UnlockMutex', 'FreeMutex',
    'CreateSemaphore', 'SignalSemaphore', 'WaitSemaphore', 'FreeSemaphore'
];

// 所有内置函数的合并列表
export const allBuiltInFunctions = [
    ...builtInFunctions,
    ...arrayFunctions,
    ...listFunctions,
    ...mapFunctions,
    ...windowsApiFunctions,
    ...graphicsFunctions,
    ...networkFunctions,
    ...databaseFunctions,
    ...threadFunctions
];

// 常见的无参数内置函数（用于决定补全是否插入()且不触发参数提示）
export const zeroParamBuiltInFunctions = [
    'EventWindow',
    'EventGadget',
    'EventMenu',
    'WindowEvent',
    'CountProgramParameters',
    'GetCurrentDirectory'
];

// PureBasic类型后缀
export const typeSuffixes = [
    'i',    // Integer
    'l',    // Long
    'w',    // Word
    'b',    // Byte
    'c',    // Character
    's',    // String
    'f',    // Float
    'd',    // Double
    'q',    // Quad
    'a',    // Ascii
    'u'     // Unicode
];

const pureBasicConstantNamePattern = '[a-zA-Z_][a-zA-Z0-9_]*(?:[$@]|[.][a-zA-Z]+)?';
// Regex excludes inline comments to avoid capturing them as part of the value
const pureBasicConstantDefinitionRegex = new RegExp(`^#(${pureBasicConstantNamePattern})\\s*=\\s*([^;]*?)(?:\\s*;.*)?$`, 'i');
const pureBasicConstantDeclarationRegex = new RegExp(`^#(${pureBasicConstantNamePattern})(?:\\s*=\\s*(.*))?$`, 'i');

export interface ParsedPureBasicConstant {
    name: string;
    value?: string;
}

export function parsePureBasicConstantDefinition(line: string): ParsedPureBasicConstant | null {
    const match = line.trim().match(pureBasicConstantDefinitionRegex);
    if (!match) {
        return null;
    }

    return {
        name: match[1],
        value: match[2]
    };
}

export function parsePureBasicConstantDeclaration(line: string): ParsedPureBasicConstant | null {
    const match = line.trim().match(pureBasicConstantDeclarationRegex);
    if (!match) {
        return null;
    }

    return {
        name: match[1],
        value: match[2]
    };
}

/**
 * 检查是否为有效的PureBasic类型
 */
export function isValidType(type: string): boolean {
    const lowerType = type.toLowerCase();

    // 检查基本类型
    if (types.some(t => t.toLowerCase() === lowerType)) {
        return true;
    }

    // 检查类型后缀（如.i, .s等）
    if (typeSuffixes.includes(lowerType)) {
        return true;
    }

    // 检查自定义类型模式（字母或下划线开头，包含字母数字和下划线）
    // 支持: MyType, _PrivateType, CONSTANT_TYPE, camelCase, snake_case等
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(type)) {
        return true;
    }

    return false;
}
