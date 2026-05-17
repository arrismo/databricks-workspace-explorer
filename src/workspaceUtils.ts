export type WorkspaceObjectType = "DIRECTORY" | "NOTEBOOK" | "FILE" | string;
export type NormalizedFileType = "directory" | "file";

const NOTEBOOK_SUFFIX = ".ipynb";

export type WorkspaceTransferFormat = "SOURCE" | "AUTO" | "JUPYTER";

export function toDbPath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function toFileType(objectType: string): NormalizedFileType {
  return objectType === "DIRECTORY" ? "directory" : "file";
}

export function displayNameForObject(path: string, objectType: WorkspaceObjectType): string {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  if (objectType === "NOTEBOOK" && !name.endsWith(NOTEBOOK_SUFFIX)) {
    return `${name}${NOTEBOOK_SUFFIX}`;
  }
  return name;
}

export function isNotebookUriPath(path: string): boolean {
  return path.toLowerCase().endsWith(NOTEBOOK_SUFFIX);
}

export function exportFormatForPath(path: string, objectType: WorkspaceObjectType): WorkspaceTransferFormat {
  if (objectType !== "NOTEBOOK") return "AUTO";
  return isNotebookUriPath(path) ? "JUPYTER" : "SOURCE";
}

export function importFormatForPath(path: string): WorkspaceTransferFormat {
  return isNotebookUriPath(path) ? "JUPYTER" : "SOURCE";
}

export function toWorkspacePathFromUriPath(path: string): string {
  const normalized = toDbPath(path);
  if (!isNotebookUriPath(normalized)) {
    return normalized;
  }
  return normalized.slice(0, -NOTEBOOK_SUFFIX.length);
}

export function decodeBase64Content(content?: string): Uint8Array {
  if (!content) return new Uint8Array();
  return new Uint8Array(Buffer.from(content, "base64"));
}
