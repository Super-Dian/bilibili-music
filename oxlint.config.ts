import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["import", "vue", "oxc", "typescript"],
  rules: {
    "eslint/no-unused-expressions": [
      "error",
      {
        allowShortCircuit: true,
      },
    ],
    "typescript/consistent-type-imports": "error",
    "import/consistent-type-specifier-style": "error",
    "typescript/no-redundant-type-constituents": "off",
  },
  options: {
    typeAware: true,
  },
});
