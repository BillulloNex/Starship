export interface FileTreeNode {
  name: string;
  path: string; // full path relative to workspace root
  isDirectory: boolean;
  children: FileTreeNode[];
}

function sortTreeInPlace(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.isDirectory) sortTreeInPlace(child);
  }
}

/**
 * Build a tree representation of a flat list of relative file paths.
 * Directories are sorted before files; siblings are sorted alphabetically.
 */
function getOrCreateChild(
  parent: FileTreeNode,
  childMap: Map<FileTreeNode, Map<string, FileTreeNode>>,
  segment: string,
  prefix: string,
  isDirectory: boolean,
): FileTreeNode {
  let map = childMap.get(parent);
  if (!map) {
    map = new Map();
    childMap.set(parent, map);
  }
  const existing = map.get(segment);
  if (existing) {
    // Promote a leaf to a directory if it was previously assumed to be a file
    if (isDirectory && !existing.isDirectory) {
      existing.isDirectory = true;
    }
    return existing;
  }
  const node: FileTreeNode = {
    name: segment,
    path: prefix,
    isDirectory,
    children: [],
  };
  parent.children.push(node);
  map.set(segment, node);
  return node;
}

export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  const childMap = new Map<FileTreeNode, Map<string, FileTreeNode>>();

  for (const rawPath of paths) {
    const isExplicitDir = rawPath.endsWith("/");
    const segments = rawPath.split("/").filter(Boolean);
    if (segments.length > 0) {
      let cursor: FileTreeNode = root;
      let prefix = "";
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        prefix = prefix ? `${prefix}/${segment}` : segment;
        const isLast = i === segments.length - 1;
        const isDirectory = !isLast || isExplicitDir;
        cursor = getOrCreateChild(
          cursor,
          childMap,
          segment,
          prefix,
          isDirectory,
        );
      }
    }
  }

  sortTreeInPlace(root);
  return root;
}

/**
 * Filter a FileTreeNode hierarchy by a search string.
 * Keeps any node whose name or path contains the search string,
 * along with all of its ancestors.
 */
export function filterFileTree(
  node: FileTreeNode,
  searchQuery: string,
): FileTreeNode | null {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return node;

  const isMatch =
    node.name.toLowerCase().includes(query) ||
    node.path.toLowerCase().includes(query);

  const filteredChildren: FileTreeNode[] = [];
  for (const child of node.children) {
    const filtered = filterFileTree(child, query);
    if (filtered) {
      filteredChildren.push(filtered);
    }
  }

  if (isMatch || filteredChildren.length > 0) {
    return {
      ...node,
      children: filteredChildren,
    };
  }

  return null;
}
