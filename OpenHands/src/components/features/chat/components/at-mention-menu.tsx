import React, { useEffect, useRef } from "react";
import { cn } from "#/utils/utils";
import {
  dropdownInstantColorClassName,
  dropdownMenuListClassName,
} from "#/utils/dropdown-classes";
import { Text } from "#/ui/typography";
import { AtMentionItem } from "#/hooks/chat/use-at-mention";
import FileIcon from "#/icons/file.svg?react";
import FolderIcon from "#/icons/folder.svg?react";

interface AtMentionMenuItemProps {
  item: AtMentionItem;
  isSelected: boolean;
  onSelect: (item: AtMentionItem) => void;
  ref?: React.Ref<HTMLButtonElement>;
}

function AtMentionMenuItem({
  item,
  isSelected,
  onSelect,
  ref,
}: AtMentionMenuItemProps) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      ref={ref}
      type="button"
      className={cn(
        "w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors",
        dropdownInstantColorClassName,
        isSelected ? "bg-tertiary" : "hover:bg-[var(--oh-surface-raised)]",
      )}
      onMouseDown={(e) => {
        // Use mouseDown instead of click to fire before input blur
        e.preventDefault();
        onSelect(item);
      }}
    >
      <div className="flex-shrink-0 text-[var(--oh-muted)]">
        {item.isDirectory ? (
          <FolderIcon className="w-4 h-4 text-sky-400" />
        ) : (
          <FileIcon className="w-4 h-4 text-[var(--oh-foreground)] opacity-70" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col">
        <Text className="font-normal text-sm text-[var(--oh-foreground)] truncate">
          {item.name}
        </Text>
        <Text className="text-xs text-[var(--oh-muted)] truncate font-mono">
          {item.path}
        </Text>
      </div>
    </button>
  );
}

interface AtMentionMenuProps {
  items: AtMentionItem[];
  selectedIndex: number;
  onSelect: (item: AtMentionItem) => void;
}

export function AtMentionMenu({
  items,
  selectedIndex,
  onSelect,
}: AtMentionMenuProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep refs array in sync with items length
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Files and folders"
      className="absolute bottom-full left-0 w-full mb-1 bg-[var(--oh-surface)] border border-[var(--oh-border-subtle)] rounded-lg shadow-lg max-h-[300px] overflow-y-auto custom-scrollbar z-50"
      data-testid="at-mention-menu"
    >
      <div className="px-3 py-2 text-xs text-[var(--oh-muted)] border-b border-[var(--oh-border-subtle)] font-medium">
        Files & Folders
      </div>
      <div className={dropdownMenuListClassName}>
        {items.map((item, index) => (
          <AtMentionMenuItem
            key={`${item.path}-${item.isDirectory ? "dir" : "file"}`}
            item={item}
            isSelected={index === selectedIndex}
            onSelect={onSelect}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}
