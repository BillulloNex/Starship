import AgentServerRuntimeService, {
  CommandResult,
} from "./agent-server-runtime-service";

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class WorkspaceFileOperationsService {
  /**
   * Creates a new file at `relativePath` within the workspace working directory,
   * creating any parent directories as needed.
   */
  static async createFile(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    workingDir: string | undefined,
    relativePath: string,
    initialContent = "",
  ): Promise<CommandResult> {
    const b64Path = toBase64(relativePath);
    const b64Content = toBase64(initialContent);

    const script = `python3 -c "import base64, pathlib; p = pathlib.Path(base64.b64decode('${b64Path}').decode('utf-8')); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(base64.b64decode('${b64Content}').decode('utf-8'))"`;

    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      script,
      workingDir,
      15,
    );
  }

  /**
   * Creates a new directory at `relativePath` within the workspace working directory.
   */
  static async createFolder(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    workingDir: string | undefined,
    relativePath: string,
  ): Promise<CommandResult> {
    const b64Path = toBase64(relativePath);

    const script = `python3 -c "import base64, pathlib; p = pathlib.Path(base64.b64decode('${b64Path}').decode('utf-8')); p.mkdir(parents=True, exist_ok=True)"`;

    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      script,
      workingDir,
      15,
    );
  }

  /**
   * Saves text content to an existing or new file at `relativePath`.
   */
  static async saveFileContent(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    workingDir: string | undefined,
    relativePath: string,
    content: string,
  ): Promise<CommandResult> {
    const b64Path = toBase64(relativePath);
    const b64Content = toBase64(content);

    const script = `python3 -c "import base64, pathlib; p = pathlib.Path(base64.b64decode('${b64Path}').decode('utf-8')); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(base64.b64decode('${b64Content}').decode('utf-8'))"`;

    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      script,
      workingDir,
      20,
    );
  }

  /**
   * Deletes a file or directory at `relativePath`.
   */
  static async deletePath(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    workingDir: string | undefined,
    relativePath: string,
  ): Promise<CommandResult> {
    const b64Path = toBase64(relativePath);

    const script = `python3 -c "import base64, pathlib, shutil; p = pathlib.Path(base64.b64decode('${b64Path}').decode('utf-8')); shutil.rmtree(p) if p.is_dir() else p.unlink(missing_ok=True)"`;

    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      script,
      workingDir,
      15,
    );
  }

  /**
   * Renames / moves a file or directory from `oldPath` to `newPath`.
   */
  static async renamePath(
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    workingDir: string | undefined,
    oldPath: string,
    newPath: string,
  ): Promise<CommandResult> {
    const b64Old = toBase64(oldPath);
    const b64New = toBase64(newPath);

    const script = `python3 -c "import base64, pathlib, shutil; old_p = pathlib.Path(base64.b64decode('${b64Old}').decode('utf-8')); new_p = pathlib.Path(base64.b64decode('${b64New}').decode('utf-8')); new_p.parent.mkdir(parents=True, exist_ok=True); shutil.move(str(old_p), str(new_p))"`;

    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      script,
      workingDir,
      15,
    );
  }
}
