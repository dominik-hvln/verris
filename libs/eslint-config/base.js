/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: {
    node: true,
    browser: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-var-requires": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error"]
  },
  ignorePatterns: [
    "dist",
    ".eslintrc.js",
    ".next",
    "node_modules"
  ]
};
