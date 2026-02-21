const path = require("node:path");
const globals = require("globals");
const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
});

module.exports = [
  {
    ignores: ["public/**", ".vite/**", "dist/**", "dist-electron/**", "release/**", "out/**"]
  },
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/electron",
    "plugin:import/typescript"
  ),
  {
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        tsconfigRootDir: __dirname
      },
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: [path.join(__dirname, "tsconfig.json")]
        },
        alias: {
          map: [["@", path.join(__dirname, "src")]],
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
        }
      }
    }
  },
  {
    files: ["eslint.config.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];
