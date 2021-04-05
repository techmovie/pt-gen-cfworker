module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'standard',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    'no-use-before-define': 0,
    semi: ['error', 'always'],
    camelcase: 0,
    'comma-dangle': ['error', 'always-multiline'],
    'no-irregular-whitespace': 0,
  },
};
