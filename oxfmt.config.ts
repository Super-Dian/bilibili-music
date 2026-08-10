import { defineConfig } from "oxfmt";

export default defineConfig({
  semi: false,
  singleQuote: true,
  sortImports: {
    partitionByComment: true,
  },
  experimentalSortImports: {
    groups: [
      ["side-effect"],
      ["builtin"],
      ["external", "external-type"],
      ["internal", "internal-type"],
      ["parent", "parent-type"],
      ["sibling", "sibling-type"],
      ["index", "index-type"],
    ],
  },
});
