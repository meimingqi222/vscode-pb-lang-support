"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Mock file system operations for testing
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));
// Mock path operations
jest.mock('path', () => ({
    ...jest.requireActual('path'),
    resolve: jest.fn(),
    dirname: jest.fn(),
    basename: jest.fn(),
    extname: jest.fn(),
    isAbsolute: jest.fn(),
}));
// Global test utilities
global.createMockDocument = (uri, content) => ({
    uri,
    getText: () => content,
    positionAt: (offset) => ({
        line: 0,
        character: offset
    }),
    offsetAt: (position) => position.character,
    lineCount: content.split('\n').length
});
global.createMockTextDocument = (uri, content) => ({
    uri,
    getText: () => content,
    positionAt: (offset) => ({
        line: 0,
        character: offset
    }),
    offsetAt: (position) => position.character,
    lineCount: content.split('\n').length,
    languageId: 'purebasic'
});
// Setup test environment
beforeAll(() => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
});
beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
});
//# sourceMappingURL=setup.js.map