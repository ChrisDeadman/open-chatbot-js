import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/src/**/__tests__/**/*.{js,ts,tsx}',
        '<rootDir>/src/**/*.{spec,test}.{js,ts,tsx}',
        '<rootDir>/test/**/*.{js,ts,tsx}',
    ],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
};

export default config;
