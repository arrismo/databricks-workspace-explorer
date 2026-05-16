import * as vscode from "vscode";
import {
  decodeBase64Content,
  displayNameForObject,
  exportFormatForPath,
  importFormatForPath,
  toFileType,
  toWorkspacePathFromUriPath,
  type WorkspaceObjectType,
} from "./workspaceUtils";

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

type WorkspaceImportFormat = "SOURCE" | "JUPYTER";

class DatabricksWorkspaceFS implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const dbPath = toWorkspacePathFromUriPath(uri.path);
    if (dbPath === "/") {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }

    const status = await this.getStatus(dbPath);
    return this.toFileStat(status);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const dbPath = toWorkspacePathFromUriPath(uri.path);
    const data = await this.api<{ objects?: WorkspaceObject[] }>(
      `/api/2.0/workspace/list?path=${encodeURIComponent(dbPath)}`
    );
    const objects = data.objects ?? [];

    return objects.map((o) => {
      const name = displayNameForObject(o.path, o.object_type);
      return [name, this.toVsFileType(o.object_type)] as [string, vscode.FileType];
    });
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const dbPath = toWorkspacePathFromUriPath(uri.path);
    const status = await this.getStatus(dbPath);

    if (status.object_type === "DIRECTORY") {
      throw vscode.FileSystemError.FileIsADirectory(uri);
    }

    const format = exportFormatForPath(uri.path, status.object_type);
    const exported = await this.api<WorkspaceExportResponse>(
      `/api/2.0/workspace/export?path=${encodeURIComponent(dbPath)}&format=${format}`
    );

    return decodeBase64Content(exported.content);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const path = toWorkspacePathFromUriPath(uri.path);
    await this.apiPost("/api/2.0/workspace/mkdirs", { path });
    this.emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const path = toWorkspacePathFromUriPath(uri.path);

    if (!options.create && !(await this.exists(path))) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (!options.overwrite && (await this.exists(path))) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const format = importFormatForPath(uri.path) as WorkspaceImportFormat;
    await this.apiPost("/api/2.0/workspace/import", {
      path,
      format,
      overwrite: true,
      content: Buffer.from(content).toString("base64"),
    });

    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const path = toWorkspacePathFromUriPath(uri.path);
    await this.apiPost("/api/2.0/workspace/delete", {
      path,
      recursive: options.recursive,
    });
    this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    const oldPath = toWorkspacePathFromUriPath(oldUri.path);
    const newPath = toWorkspacePathFromUriPath(newUri.path);

    const status = await this.getStatus(oldPath);
    if (status.object_type === "DIRECTORY") {
      throw vscode.FileSystemError.NoPermissions("Directory rename is not yet supported");
    }

    if (!options.overwrite && (await this.exists(newPath))) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    const content = await this.readFile(oldUri);
    await this.writeFile(newUri, content, { create: true, overwrite: true });
    await this.apiPost("/api/2.0/workspace/delete", { path: oldPath, recursive: false });

    this.emitter.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);
  }

  private toFileStat(o: WorkspaceObject): vscode.FileStat {
    return {
      type: this.toVsFileType(o.object_type),
      ctime: o.created_at ?? 0,
      mtime: o.modified_at ?? 0,
      size: o.size ?? 0,
    };
  }

  private toVsFileType(objectType: WorkspaceObjectType): vscode.FileType {
    return toFileType(objectType) === "directory" ? vscode.FileType.Directory : vscode.FileType.File;
  }

  private async getStatus(path: string): Promise<WorkspaceObject> {
    return this.api<WorkspaceObject>(
      `/api/2.0/workspace/get-status?path=${encodeURIComponent(path)}`
    );
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.getStatus(path);
      return true;
    } catch {
      return false;
    }
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

  private async apiPost(endpoint: string, body: unknown): Promise<void> {
    const config = vscode.workspace.getConfiguration("databricksWorkspace");
    const host = (config.get<string>("host") || process.env.DATABRICKS_HOST || "").replace(/\/$/, "");
    const token = config.get<string>("token") || process.env.DATABRICKS_TOKEN || "";

    if (!host || !token) {
      throw vscode.FileSystemError.Unavailable(
        "Set databricksWorkspace.host and databricksWorkspace.token (or DATABRICKS_HOST/DATABRICKS_TOKEN)."
      );
    }

    const res = await fetch(`${host}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw vscode.FileSystemError.Unavailable(`Databricks API ${res.status}: ${text}`);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DatabricksWorkspaceFS();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("dbws", provider, {
      isCaseSensitive: true,
      isReadonly: false,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("databricksWorkspace.openRoot", async () => {
      const uri = vscode.Uri.parse("dbws:/");
      await vscode.commands.executeCommand("vscode.openFolder", uri, false);
    })
  );
}

export function deactivate(): void {}
