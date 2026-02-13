/**
 * PureBasic language constants definition
 * Contains keywords, built-in types, built-in functions, etc.
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

// Array functions
export const arrayFunctions = [
    'ArraySize', 'FreeArray', 'ClearArray', 'CopyArray', 'ResizeArray',
    'SortArray', 'SortStructuredArray', 'RandomizeArray'
];

// List functions
export const listFunctions = [
    'NewList', 'AddElement', 'InsertElement', 'DeleteElement', 'ClearList',
    'ListIndex', 'ListSize', 'ResetList', 'NextElement', 'PreviousElement',
    'FirstElement', 'LastElement', 'SelectElement', 'ChangeCurrentElement',
    'MoveElement', 'SwapElements', 'SortList', 'SortStructuredList',
    'PushListPosition', 'PopListPosition', 'CopyList', 'FreeList'
];

// Map functions
export const mapFunctions = [
    'NewMap', 'DeleteMapElement', 'ClearMap', 'CopyMap', 'FreeMap',
    'MapSize', 'AddMapElement', 'FindMapElement', 'NextMapElement',
    'PreviousMapElement', 'ResetMap'
];

// Windows API functions
export const windowsApiFunctions = [
    'MessageBox_', 'GetWindowText_', 'SetWindowText_', 'FindWindow_',
    'GetDesktopWindow_', 'GetForegroundWindow_', 'SetForegroundWindow_',
    'ShowWindow_', 'MoveWindow_', 'GetWindowRect_', 'SetWindowPos_',
    'CreateFile_', 'ReadFile_', 'WriteFile_', 'CloseHandle_',
    'GetCurrentDirectory_', 'SetCurrentDirectory_', 'CreateDirectory_',
    'DeleteFile_', 'CopyFile_', 'MoveFile_', 'FindFirstFile_', 'FindNextFile_',
    'RegOpenKeyEx_', 'RegQueryValueEx_', 'RegSetValueEx_', 'RegCloseKey_'
];

// Graphics and game-related functions
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

// Network functions
export const networkFunctions = [
    'InitNetwork', 'CreateNetworkServer', 'CreateNetworkClient', 'CloseNetworkServer',
    'CloseNetworkClient', 'NetworkServerEvent', 'NetworkClientEvent',
    'SendNetworkString', 'ReceiveNetworkString', 'SendNetworkData', 'ReceiveNetworkData',
    'IPString', 'HostIP', 'GetClientIP'
];

// Database functions
export const databaseFunctions = [
    'OpenDatabase', 'CloseDatabase', 'DatabaseQuery', 'NextDatabaseRow',
    'GetDatabaseString', 'GetDatabaseLong', 'GetDatabaseFloat', 'GetDatabaseDouble',
    'SetDatabaseString', 'SetDatabaseLong', 'SetDatabaseFloat', 'SetDatabaseDouble',
    'DatabaseUpdate', 'DatabaseColumnName', 'DatabaseColumns'
];

// Thread functions
export const threadFunctions = [
    'CreateThread', 'WaitThread', 'KillThread', 'ThreadID', 'IsThread',
    'CreateMutex', 'LockMutex', 'UnlockMutex', 'FreeMutex',
    'CreateSemaphore', 'SignalSemaphore', 'WaitSemaphore', 'FreeSemaphore'
];

// Merged list of all built-in functions
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

// Common zero-parameter built-in functions (used to determine whether completion should insert () and not trigger parameter hints)
export const zeroParamBuiltInFunctions = [
    'EventWindow',
    'EventGadget',
    'EventMenu',
    'WindowEvent',
    'CountProgramParameters',
    'GetCurrentDirectory'
];

// PureBasic type suffixes
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

/**
 * Check if a valid PureBasic type
 */
export function isValidType(type: string): boolean {
    const lowerType = type.toLowerCase();

    // Check basic types
    if (types.some(t => t.toLowerCase() === lowerType)) {
        return true;
    }

    // Check type suffixes (such as .i, .s, etc.)
    if (typeSuffixes.includes(lowerType)) {
        return true;
    }

    // Check custom type pattern (start with letters or underscores, contain letters, numbers, and underscores)
    // Support: MyType, _PrivateType, CONSTANT_TYPE, camelCase, snake_case, etc.
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(type)) {
        return true;
    }

    return false;
}
