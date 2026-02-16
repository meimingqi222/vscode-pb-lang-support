// Jest setup file
import * as path from 'path';
import * as fs from 'fs';

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
declare global {
  var createMockDocument: (uri: string, content: string) => any;
  var createMockTextDocument: (uri: string, content: string) => any;
}

global.createMockDocument = (uri: string, content: string) => ({
  uri,
  getText: () => content,
  positionAt: (offset: number) => ({
    line: 0,
    character: offset
  }),
  offsetAt: (position: any) => position.character,
  lineCount: content.split('\n').length
});

global.createMockTextDocument = (uri: string, content: string) => ({
  uri,
  getText: () => content,
  positionAt: (offset: number) => ({
    line: 0,
    character: offset
  }),
  offsetAt: (position: any) => position.character,
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