module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    'no-console': 'off',
    'no-plusplus': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'no-continue': 'off',
    'class-methods-use-this': 'off',
  },
};
