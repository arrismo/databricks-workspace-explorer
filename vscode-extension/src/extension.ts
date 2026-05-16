import * as vscode from "vscode";

type WorkspaceObjectType = "DIRECTORY" | "NOTEBOOK" | "FILE" | string;

type WorkspaceObject = {
  path: string;
  object_type: WorkspaceObjectType;
  language?: string;
  size?: number;
  modified_at?: number;
  created_at?: number;
};

type WorkspaceExportResponse = {
  content?: string;
};

class DatabricksWorkspaceFS implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const dbPath = this.toDbPath(uri);
    if (dbPath === "/") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }

    const status = await this.getStatus(dbPath);
    return this.toFileStat(status);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const dbPath = this.toDbPath(uri);
    const data = await this.api<{ objects?: WorkspaceObject[] }>(
      `/api/2.0/workspace/list?path=${encodeURIComponent(dbPath)}`
    );
    const objects = data.objects ?? [];

    return objects.map((o) => {
      const name = o.path.split("/").filter(Boolean).pop() ?? o.path;
      return [name, this.toFileType(o.object_type)] as [string, vscode.FileType];
    });
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const dbPath = this.toDbPath(uri);
    const status = await this.getStatus(dbPath);

    if (status.object_type === "DIRECTORY") {
      throw vscode.FileSystemError.FileIsADirectory(uri);
    }

    const format = status.object_type === "NOTEBOOK" ? "SOURCE" : "AUTO";
    const exported = await this.api<WorkspaceExportResponse>(
      `/api/2.0/workspace/export?path=${encodeURIComponent(dbPath)}&format=${format}`
    );

    const content = exported.content ?? "";
    const decoded = Buffer.from(content, "base64");
    return new Uint8Array(decoded);
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only provider");
  }

  writeFile(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only provider");
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only provider");
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions("Read-only provider");
  }

  private toDbPath(uri: vscode.Uri): string {
    const p = uri.path || "/";
    return p.startsWith("/") ? p : `/${p}`;
  }

  private toFileStat(o: WorkspaceObject): vscode.FileStat {
    return {
      type: this.toFileType(o.object_type),
      ctime: o.created_at ?? 0,
      mtime: o.modified_at ?? 0,
      size: o.size ?? 0,
    };
  }

  private toFileType(objectType: WorkspaceObjectType): vscode.FileType {
    if (objectType === "DIRECTORY") {
      return vscode.FileType.Directory;
    }
    return vscode.FileType.File;
  }

  private async getStatus(path: string): Promise<WorkspaceObject> {
    return this.api<WorkspaceObject>(
      `/api/2.0/workspace/get-status?path=${encodeURIComponent(path)}`
    );
  }

  private async api<T>(endpoint: string): Promise<T> {
    const config = vscode.workspace.getConfiguration("databricksWorkspace");
    const host = (config.get<string>("host") || process.env.DATABRICKS_HOST || "").replace(/\/$/, "");
    const token = config.get<string>("token") || process.env.DATABRICKS_TOKEN || "";

    if (!host || !token) {
      throw vscode.FileSystemError.Unavailable(
        "Set databricksWorkspace.host and databricksWorkspace.token (or DATABRICKS_HOST/DATABRICKS_TOKEN)."
      );
    }

    const res = await fetch(`${host}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw vscode.FileSystemError.Unavailable(`Databricks API ${res.status}: ${body}`);
    }

    return (await res.json()) as T;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DatabricksWorkspaceFS();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("dbws", provider, {
      isCaseSensitive: true,
      isReadonly: true,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("databricksWorkspace.openRoot", async () => {
      const uri = vscode.Uri.parse("dbws:/");
      await vscode.commands.executeCommand("vscode.openFolder", uri, true);
    })
  );
}

export function deactivate(): void {}
