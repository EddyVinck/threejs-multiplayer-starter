import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["packages/client/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ["packages/server/**/*.ts", "packages/shared/**/*.ts", "*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
);
