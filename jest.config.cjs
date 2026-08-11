module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@pierre/diffs/react$': '<rootDir>/src/__mocks__/pierreDiffsReact.ts',
    '\\.svg$': '<rootDir>/src/shared/icons/__mocks__/svgMock.ts',
    '\\.css$': '<rootDir>/src/__mocks__/styleMock.ts',
  },
};
