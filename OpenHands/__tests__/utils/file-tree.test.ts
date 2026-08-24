import { describe, it, expect } from "vitest";

import { buildFileTree, filterFileTree } from "#/utils/file-tree";

describe("buildFileTree", () => {
  it("builds a nested tree from flat paths", () => {
    const root = buildFileTree([
      "src/a.ts",
      "src/sub/b.ts",
      "README.md",
    ]);

    expect(root.children.map((c) => c.name)).toEqual(["src", "README.md"]);

    const srcDir = root.children.find((c) => c.name === "src");
    expect(srcDir?.isDirectory).toBe(true);
    expect(srcDir?.children.map((c) => c.name)).toEqual(["sub", "a.ts"]);

    const readme = root.children.find((c) => c.name === "README.md");
    expect(readme?.isDirectory).toBe(false);
    expect(readme?.path).toBe("README.md");
  });

  it("handles explicit empty directories with trailing slashes", () => {
    const root = buildFileTree(["src/empty_dir/"]);

    const srcDir = root.children.find((c) => c.name === "src");
    expect(srcDir?.isDirectory).toBe(true);

    const emptyDir = srcDir?.children.find((c) => c.name === "empty_dir");
    expect(emptyDir?.isDirectory).toBe(true);
    expect(emptyDir?.children).toEqual([]);
  });

  it("sorts directories before files at every level", () => {
    const root = buildFileTree([
      "z-file.ts",
      "dir/inner.ts",
      "a-file.ts",
    ]);
    const names = root.children.map((c) => c.name);
    expect(names).toEqual(["dir", "a-file.ts", "z-file.ts"]);
  });

  it("does not duplicate directory nodes when many files share a directory", () => {
    const root = buildFileTree([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(3);
  });

  it("returns an empty tree when given no paths", () => {
    const root = buildFileTree([]);
    expect(root.children).toEqual([]);
  });

  it("promotes a previously-leaf node to a directory when a deeper path needs it", () => {
    const root = buildFileTree(["src", "src/index.ts"]);

    const srcNode = root.children.find((c) => c.name === "src");
    expect(srcNode).toBeDefined();
    expect(srcNode?.isDirectory).toBe(true);
    expect(srcNode?.children.map((c) => c.name)).toEqual(["index.ts"]);
  });

  it("handles very wide directories efficiently (regression: O(n) lookup)", () => {
    const paths = Array.from({ length: 5000 }, (_, i) => `pkg/file_${i}.ts`);
    const root = buildFileTree(paths);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].name).toBe("pkg");
    expect(root.children[0].children).toHaveLength(5000);
  });
});

describe("filterFileTree", () => {
  it("filters tree keeping matching nodes and ancestor directories", () => {
    const root = buildFileTree([
      "src/components/button.tsx",
      "src/utils/helpers.ts",
      "docs/readme.md",
    ]);

    const filtered = filterFileTree(root, "button");
    expect(filtered).not.toBeNull();
    expect(filtered?.children.map((c) => c.name)).toEqual(["src"]);

    const src = filtered?.children[0];
    expect(src?.children.map((c) => c.name)).toEqual(["components"]);

    const components = src?.children[0];
    expect(components?.children.map((c) => c.name)).toEqual(["button.tsx"]);
  });

  it("returns null if no matches in subtree", () => {
    const root = buildFileTree(["src/index.ts"]);
    const filtered = filterFileTree(root, "nonexistent");
    expect(filtered).toBeNull();
  });
});
