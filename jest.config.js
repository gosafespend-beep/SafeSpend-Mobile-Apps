// Unit tests for the PURE money-math layer (src/lib) — node environment, no RN
// renderer. Modules that import the supabase client (which drags in RN/AsyncStorage)
// are mapped to a stub; the functions under test never touch the network.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/asyncStorageMock.js',
    '\\./supabase$': '<rootDir>/__mocks__/supabaseMock.js',
  },
};
