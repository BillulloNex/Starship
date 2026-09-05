export interface OpencodeModelOption {
  /** Exact ACP model selection value (e.g. `opencode/big-pickle` or `anthropic/claude-sonnet-4-6`). */
  id: string;
  label: string;
  isDefault?: boolean;
}

export interface OpencodeModelsResponse {
  provider: "opencode";
  models: OpencodeModelOption[];
  modelCount: number;
  updatedAt: number;
}
