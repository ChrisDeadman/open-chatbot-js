import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,ts,tsx}',
        '<rootDir>/src/**/*.{spec,test}.{js,ts,tsx}',
        '<rootDir>/test/**/*.{js,ts,tsx}',
    ],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
};

export default jestConfig;
