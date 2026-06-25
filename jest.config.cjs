module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ant-design/icons$': '<rootDir>/src/__mocks__/antDesignIconsMock.ts',
    '\\.svg$': '<rootDir>/src/shared/icons/__mocks__/svgMock.ts',
    '\\.module\\.css$': '<rootDir>/src/__mocks__/styleMock.ts',
  },
};
