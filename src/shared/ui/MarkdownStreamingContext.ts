import { createContext, useContext } from "react";

export const MarkdownStreamingContext = createContext(false);
export const useMarkdownStreaming = () => useContext(MarkdownStreamingContext);
