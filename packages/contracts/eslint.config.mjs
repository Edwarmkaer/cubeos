import tseslint from "typescript-eslint";

export default tseslint.config({ignores:["src/cloud-validator.mjs"]},...tseslint.configs.recommended);
