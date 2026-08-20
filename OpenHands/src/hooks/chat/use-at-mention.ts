import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWorkspaceFiles } from "#/hooks/query/use-workspace-files";

export interface AtMentionItem {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Get the cursor's character offset within a contentEditable element. */
function getCursorOffset(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return -1;
  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

/**
 * Extract all unique directories and files from a list of workspace file paths.
 */
function extractMentionItems(filePaths: string[]): AtMentionItem[] {
  const items: AtMentionItem[] = [];
  const dirSet = new Set<string>();

  for (const filePath of filePaths) {
    // Add file
    const parts = filePath.split("/");
    const fileName = parts[parts.length - 1];
    items.push({
      name: fileName,
      path: filePath,
      isDirectory: false,
    });

    // Collect all ancestor directory paths
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      dirSet.add(dirPath);
    }
  }

  // Add directories
  for (const dirPath of dirSet) {
    const dirName = dirPath.split("/").pop() || dirPath;
    items.push({
      name: `${dirName}/`,
      path: dirPath,
      isDirectory: true,
    });
  }

  return items;
}

const MAX_DISPLAY_ITEMS = 20;

/**
 * Hook for managing @ mention autocomplete for files & folders in the chat input.
 * Detects when user types "@" and provides filtered file and directory suggestions.
 */
export const useAtMention = (
  chatInputRef: React.RefObject<HTMLDivElement | null>,
) => {
  const { data: filePaths, isLoading } = useWorkspaceFiles();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allItems = useMemo(() => {
    if (!filePaths || filePaths.length === 0) return [];
    return extractMentionItems(filePaths);
  }, [filePaths]);

  // Filter items based on user input after "@"
  const filteredItems = useMemo(() => {
    if (!allItems.length) return [];
    if (!filterText) {
      // Default: show top files and folders
      return allItems.slice(0, MAX_DISPLAY_ITEMS);
    }

    const lower = filterText.toLowerCase();

    // Score and rank matches:
    // 1. exact name match
    // 2. name starts with filter
    // 3. path starts with filter
    // 4. name contains filter
    // 5. path contains filter
    const scored: { item: AtMentionItem; score: number }[] = [];

    for (const item of allItems) {
      const nameLower = item.name.toLowerCase();
      const pathLower = item.path.toLowerCase();

      if (nameLower === lower || nameLower === `${lower}/`) {
        scored.push({ item, score: 100 });
      } else if (nameLower.startsWith(lower)) {
        scored.push({ item, score: 80 });
      } else if (pathLower.startsWith(lower)) {
        scored.push({ item, score: 60 });
      } else if (nameLower.includes(lower)) {
        scored.push({ item, score: 40 });
      } else if (pathLower.includes(lower)) {
        scored.push({ item, score: 20 });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // If same score, prefer directories or shorter paths
      if (a.item.isDirectory !== b.item.isDirectory) {
        return a.item.isDirectory ? -1 : 1;
      }
      return a.item.path.length - b.item.path.length;
    });

    return scored.slice(0, MAX_DISPLAY_ITEMS).map((s) => s.item);
  }, [allItems, filterText]);

  // Keep refs in sync so handleAtMentionKeyDown always reads the latest values
  const isMenuOpenRef = useRef(isMenuOpen);
  isMenuOpenRef.current = isMenuOpen;
  const filteredItemsRef = useRef(filteredItems);
  filteredItemsRef.current = filteredItems;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  // Reset selected index when the filter text changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filterText]);

  // Track character range of the current @ mention word
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Detect an @ word at the cursor position.
  const getMentionText = useCallback((): {
    text: string;
    start: number;
    end: number;
  } | null => {
    const element = chatInputRef.current;
    if (!element) return null;

    const text = (element.innerText || "").replace(/[\n\r]+$/, "");
    const cursor = getCursorOffset(element);
    if (cursor < 0) return null;

    const textBeforeCursor = text.slice(0, cursor);

    // Match an "@" preceded by whitespace or at position 0, followed by non-whitespace characters
    const match = textBeforeCursor.match(/(^|\s)(@\S*)$/);
    if (!match) return null;

    const atWord = match[2]; // e.g. "@src" or "@"
    const start = textBeforeCursor.length - atWord.length;
    const afterCursor = text.slice(cursor);
    const trailing = afterCursor.match(/^\S*/);
    const end = cursor + (trailing ? trailing[0].length : 0);

    return { text: atWord.slice(1), start, end }; // strip leading "@"
  }, [chatInputRef]);

  // Update the menu state based on current input
  const updateAtMentionMenu = useCallback(() => {
    const result = getMentionText();

    if (result !== null && (allItems.length > 0 || isLoading)) {
      setFilterText(result.text);
      mentionRangeRef.current = { start: result.start, end: result.end };
      setIsMenuOpen(true);
    } else {
      setIsMenuOpen(false);
      setFilterText("");
      mentionRangeRef.current = null;
    }
  }, [getMentionText, allItems.length, isLoading]);

  // Select an item and replace only the @ word with the path
  const selectItem = useCallback(
    (item: AtMentionItem) => {
      const element = chatInputRef.current;
      if (!element) return;

      const mentionRange = mentionRangeRef.current;
      const currentText = (element.innerText || "").replace(/[\n\r]+$/, "");
      const formattedPath = item.isDirectory ? `${item.path}/` : item.path;
      const replacement = `@${formattedPath} `;

      if (mentionRange) {
        element.textContent =
          currentText.slice(0, mentionRange.start) +
          replacement +
          currentText.slice(mentionRange.end);

        // Position cursor right after the inserted mention + space
        const cursorPos = mentionRange.start + replacement.length;
        const textNode = element.firstChild;
        if (textNode) {
          const range = document.createRange();
          const sel = window.getSelection();
          const offset = Math.min(cursorPos, textNode.textContent!.length);
          range.setStart(textNode, offset);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      } else {
        element.textContent = replacement;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      setIsMenuOpen(false);
      setFilterText("");
      setSelectedIndex(0);
      mentionRangeRef.current = null;

      // Trigger a native InputEvent so React's onInput fires (for smartResize etc.)
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));

      // Restore focus so keyboard events work after selection
      element.focus();
    },
    [chatInputRef],
  );

  // Handle keyboard navigation in the menu
  const handleAtMentionKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      const items = filteredItemsRef.current;
      if (!isMenuOpenRef.current || items.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        case "Enter":
        case "Tab": {
          const item = items[selectedIndexRef.current];
          if (!item) return false;
          e.preventDefault();
          selectItem(item);
          return true;
        }
        case "Escape":
          e.preventDefault();
          setIsMenuOpen(false);
          return true;
        case "ArrowLeft":
        case "ArrowRight":
        case "Home":
        case "End":
          setIsMenuOpen(false);
          return false;
        default:
          return false;
      }
    },
    [selectItem],
  );

  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  return {
    isMenuOpen,
    filteredItems,
    selectedIndex,
    updateAtMentionMenu,
    selectItem,
    handleAtMentionKeyDown,
    closeMenu,
  };
};
