// Minimal vscode shim used for unit tests.
// Provides just enough of the VS Code API for DatabricksWorkspaceFS to function.

export const FileType = {
  Unknown: 0 as const,
  File: 1 as const,
  Directory: 2 as const,
  SymbolicLink: 64 as const,
} as const;

export const FileChangeType = {
  Created: 1 as const,
  Changed: 2 as const,
  Deleted: 3 as const,
} as const;

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => void> = [];
  readonly event = (listener: (e: T) => void) => {
    this._listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: T): void {
    for (const fn of this._listeners) {
      fn(data);
    }
  }
}

export class Disposable {
  constructor(private readonly _fn?: () => void) {}
  dispose(): void {
    this._fn?.();
  }
}

export interface FileStat {
  type: number;
  ctime: number;
  mtime: number;
  size: number;
}

export interface FileSystemProvider {
  onDidChangeFile: any;
  watch(uri: any, options: any): Disposable;
  stat(uri: any): FileStat | Thenable<FileStat>;
  readDirectory(uri: any): [string, number][] | Thenable<[string, number][]>;
  readFile(uri: any): Uint8Array | Thenable<Uint8Array>;
  createDirectory(uri: any): void | Thenable<void>;
  writeFile(uri: any, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void | Thenable<void>;
  delete(uri: any, options: { recursive: boolean }): void | Thenable<void>;
  rename(oldUri: any, newUri: any, options: { overwrite: boolean }): void | Thenable<void>;
}

function createFileSystemError(message: string, code: string) {
  const err = new Error(message) as any;
  err.code = code;
  return err;
}

export const FileSystemError = {
  FileIsADirectory: (msg: any = "File is a directory") =>
    createFileSystemError(typeof msg === "string" ? msg : "File is a directory", "FileIsADirectory"),
  FileNotFound: (msg: any = "File not found") =>
    createFileSystemError(typeof msg === "string" ? msg : "File not found", "FileNotFound"),
  FileExists: (msg: any = "File exists") =>
    createFileSystemError(typeof msg === "string" ? msg : "File exists", "FileExists"),
  Unavailable: (msg: string) => createFileSystemError(msg, "Unavailable"),
  NoPermissions: (msg: string) => createFileSystemError(msg, "NoPermissions"),
};

class Uri {
  constructor(
    public readonly scheme: string,
    public readonly path: string,
    public readonly authority: string = ""
  ) {}
  static parse(uri: string): Uri {
    const colonIdx = uri.indexOf(":");
    if (colonIdx === -1) return new Uri("unknown", uri);
    const scheme = uri.slice(0, colonIdx);
    let rest = uri.slice(colonIdx + 1);
    // Strip leading // if present (authority form like scheme://host/path)
    if (rest.startsWith("//")) {
      rest = rest.slice(2);
      const slashIdx = rest.indexOf("/");
      rest = slashIdx >= 0 ? rest.slice(slashIdx) : "/";
    }
    return new Uri(scheme, rest || "/");
  }
  static from(d: { scheme: string; path: string }) {
    return new Uri(d.scheme, d.path);
  }
}

export { Uri };

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined,
  }),
};
