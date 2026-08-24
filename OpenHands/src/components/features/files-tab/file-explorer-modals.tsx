/* eslint-disable i18next/no-literal-string, jsx-a11y/label-has-associated-control */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiKeyModalBase } from "#/components/features/settings/api-key-modal-base";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { I18nKey } from "#/i18n/declaration";

interface CreateEntryModalProps {
  isOpen: boolean;
  type: "file" | "folder";
  parentPath: string | null;
  onClose: () => void;
  onSubmit: (path: string) => Promise<void>;
  isPending: boolean;
}

export function CreateEntryModal({
  isOpen,
  type,
  parentPath,
  onClose,
  onSubmit,
  isPending,
}: CreateEntryModalProps) {
  const { t } = useTranslation("openhands");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const targetPath = parentPath
    ? `${parentPath.replace(/\/+$/, "")}/${name.trim()}`
    : name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isPending) return;
    await onSubmit(targetPath);
    onClose();
  };

  const title =
    type === "file"
      ? parentPath
        ? `Create New File in ${parentPath}`
        : "Create New File"
      : parentPath
        ? `Create New Folder in ${parentPath}`
        : "Create New Folder";

  const footer = (
    <>
      <BrandButton
        type="button"
        variant="tertiary"
        onClick={onClose}
        isDisabled={isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
      <BrandButton
        type="submit"
        variant="primary"
        isDisabled={!name.trim() || isPending}
        aria-busy={isPending}
      >
        {isPending ? (
          <LoadingSpinner size="small" />
        ) : type === "file" ? (
          "Create File"
        ) : (
          "Create Folder"
        )}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen={isOpen}
      title={title}
      onClose={isPending ? undefined : onClose}
      initialFocusRef={inputRef}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs text-[var(--oh-text-secondary)] font-medium">
          {type === "file"
            ? "File Name (e.g. index.ts)"
            : "Folder Name (e.g. components)"}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "file" ? "filename.ext" : "folder-name"}
          className="w-full px-3 py-2 text-sm bg-[var(--oh-surface-raised)] border border-[var(--oh-border)] rounded-md text-white focus:outline-none focus:border-[var(--oh-interactive)]"
        />
        {targetPath && (
          <p className="text-xs text-[var(--oh-muted)] truncate">
            Target path:{" "}
            <span className="text-white font-mono">{targetPath}</span>
          </p>
        )}
      </form>
    </ApiKeyModalBase>
  );
}

interface RenameEntryModalProps {
  isOpen: boolean;
  currentPath: string;
  isDirectory: boolean;
  onClose: () => void;
  onSubmit: (newPath: string) => Promise<void>;
  isPending: boolean;
}

export function RenameEntryModal({
  isOpen,
  currentPath,
  isDirectory,
  onClose,
  onSubmit,
  isPending,
}: RenameEntryModalProps) {
  const { t } = useTranslation("openhands");
  const initialName = currentPath.split("/").filter(Boolean).pop() || "";
  const parentPath = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/"))
    : "";

  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const newFullPath = parentPath ? `${parentPath}/${name.trim()}` : name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === initialName || isPending) return;
    await onSubmit(newFullPath);
    onClose();
  };

  const footer = (
    <>
      <BrandButton
        type="button"
        variant="tertiary"
        onClick={onClose}
        isDisabled={isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
      <BrandButton
        type="submit"
        variant="primary"
        isDisabled={!name.trim() || name.trim() === initialName || isPending}
        aria-busy={isPending}
      >
        {isPending ? <LoadingSpinner size="small" /> : "Rename"}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen={isOpen}
      title={`Rename ${isDirectory ? "Folder" : "File"}`}
      onClose={isPending ? undefined : onClose}
      initialFocusRef={inputRef}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-xs text-[var(--oh-text-secondary)] font-medium">
          New Name
        </label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-[var(--oh-surface-raised)] border border-[var(--oh-border)] rounded-md text-white focus:outline-none focus:border-[var(--oh-interactive)]"
        />
        {newFullPath && (
          <p className="text-xs text-[var(--oh-muted)] truncate">
            New path:{" "}
            <span className="text-white font-mono">{newFullPath}</span>
          </p>
        )}
      </form>
    </ApiKeyModalBase>
  );
}

interface DeleteEntryModalProps {
  isOpen: boolean;
  targetPath: string;
  isDirectory: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isPending: boolean;
}

export function DeleteEntryModal({
  isOpen,
  targetPath,
  isDirectory,
  onClose,
  onConfirm,
  isPending,
}: DeleteEntryModalProps) {
  const { t } = useTranslation("openhands");

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isPending) return;
    await onConfirm();
    onClose();
  };

  const footer = (
    <>
      <BrandButton
        type="button"
        variant="tertiary"
        onClick={onClose}
        isDisabled={isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
      <BrandButton
        type="button"
        variant="danger"
        onClick={handleConfirm}
        isDisabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? <LoadingSpinner size="small" /> : t(I18nKey.BUTTON$DELETE)}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen={isOpen}
      title={`Delete ${isDirectory ? "Folder" : "File"}`}
      onClose={isPending ? undefined : onClose}
      footer={footer}
    >
      <div className="flex flex-col gap-2 text-sm text-[var(--oh-text-secondary)]">
        <p>
          Are you sure you want to delete{" "}
          <span className="font-mono text-white font-semibold">
            {targetPath}
          </span>
          {isDirectory ? " and all of its contents" : ""}?
        </p>
        <p className="text-xs text-red-400">
          This action is permanent and cannot be undone.
        </p>
      </div>
    </ApiKeyModalBase>
  );
}
