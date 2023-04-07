module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    parserOptions: { project: ['./deads-discord-bot/tsconfig.json'] },
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    rules: {
        '@typescript-eslint/strict-boolean-expressions': [
            2,
            {
                allowString: false,
                allowNumber: false,
            },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
    ignorePatterns: ['src/**/*.test.ts', 'src/frontend/generated/*'],
};
