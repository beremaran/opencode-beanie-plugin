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
);
