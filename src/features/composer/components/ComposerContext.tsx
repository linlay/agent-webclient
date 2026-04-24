import React, { createContext, useContext } from "react";
import type { ComposerAttachment } from "@/features/composer/lib/composerAttachments";
import type { SlashCommandDefinition } from "@/features/composer/lib/slashCommands";

export interface ComposerAttachmentScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export interface ComposerContextValue {
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  activeSlashIndex: number;
  setActiveSlashIndex: React.Dispatch<React.SetStateAction<number>>;
  slashDismissed: boolean;
  setSlashDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  attachmentScrollState: ComposerAttachmentScrollState;
  openFilePicker: () => void;
  handleSend: () => void;
  interruptCurrentRun: () => Promise<void>;
  executeSlashCommand: (commandId: SlashCommandDefinition["id"]) => Promise<void>;
  toggleSpeechInput: () => void;
  applyComposerDraft: (draft: string) => void;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export const ComposerProvider: React.FC<{
  value: ComposerContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>
  );
};

export function useComposerContext(): ComposerContextValue {
  const context = useContext(ComposerContext);
  if (!context) {
    throw new Error("useComposerContext must be used within a ComposerProvider");
  }
  return context;
}
