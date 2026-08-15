import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".research/**",
      "generated/**",
      "dist/**",
      "build/**",
      "coverage/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: ["var", "let", "const"],
          next: ["var", "let", "const"],
        },
        {
          blankLine: "always",
          prev: ["var", "let", "const"],
          next: ["return", "if", "for", "while", "switch", "try", "throw"],
        },
        {
          blankLine: "always",
          prev: ["return", "if", "for", "while", "switch", "try", "throw"],
          next: ["var", "let", "const"],
        },
      ],
    },
  },
);
