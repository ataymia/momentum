module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  overrides: [{
    files: ["src/resend-mail-policy.ts", "src/resend-transport.ts",
      "src/delivery-correction.ts", "src/delivery-correction-policy.ts",
      "src/delivery-inventory-revision.ts", "src/sandbox-workflow.ts",
      "src/correction-financial-plan.ts", "src/correction-accounting-plan.ts",
      "src/live-test-product.ts"],
    rules: {"require-jsdoc": "off", "valid-jsdoc": "off"},
  }],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
  },
};
