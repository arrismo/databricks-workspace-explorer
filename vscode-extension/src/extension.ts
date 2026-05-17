import * as vscode from "vscode";
import { DatabricksWorkspaceFS } from "./DatabricksWorkspaceFS";

let outputChannel: vscode.OutputChannel;

interface AuthInfo {
  host: string;
  profile: string;
  databricksCliPath?: string;
}

function log(msg: string): void {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
  console.log(`[databricks-workspace] ${msg}`);
}

function getAuthInfo(): AuthInfo {
  const config = vscode.workspace.getConfiguration("databricksWorkspace");
  const host = config.get<string>("host")
    || process.env.DATABRICKS_HOST
    || "<not set>";
  const configuredProfile = (config.get<string>("profile") || "").trim();
  const profile = configuredProfile
    || process.env.DATABRICKS_CONFIG_PROFILE
    || "<cli default profile>";
  const databricksCliPath = (config.get<string>("databricksCliPath") || "").trim() || undefined;

  return { host, profile, databricksCliPath };
}

function toDbwsUri(path: string): vscode.Uri {
  const normalized = path.trim();
  if (!normalized || normalized === "/") {
    return vscode.Uri.parse("dbws:/");
  }
  return vscode.Uri.parse(`dbws:${normalized.startsWith("/") ? normalized : `/${normalized}`}`);
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Databricks Workspace", { log: true });
  log("Databricks Workspace Explorer activating...");

  const authInfo = getAuthInfo();
  log(`Host: ${authInfo.host}`);
  log(`Profile: ${authInfo.profile}`);

  const provider = new DatabricksWorkspaceFS();

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("dbws", provider, {
      isCaseSensitive: true,
      isReadonly: false,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("databricksWorkspace.openRoot", async () => {
      log("Opening Databricks workspace root...");
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.parse("dbws:/"), false);
    }),
    vscode.commands.registerCommand("databricksWorkspace.openPath", async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Enter a Databricks workspace path",
        placeHolder: "/Shared/example or /Users/me/notebook.ipynb",
        value: "/",
      });
      if (!input) {
        return;
      }

      const uri = toDbwsUri(input);
      try {
        const stat = await provider.stat(uri);
        if (stat.type === vscode.FileType.Directory) {
          log(`Opening Databricks workspace folder: ${uri.toString()}`);
          await vscode.commands.executeCommand("vscode.openFolder", uri, false);
          return;
        }

        log(`Opening Databricks workspace file: ${uri.toString()}`);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
      } catch (e: any) {
        void vscode.window.showErrorMessage(`Failed to open workspace path: ${e?.message ?? e}`);
      }
    }),
    vscode.commands.registerCommand("databricksWorkspace.refresh", async () => {
      log("Refreshing Databricks workspace explorer...");
      provider.refresh();
      try {
        await vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
      } catch {
        // Ignore if the explorer refresh command is unavailable.
      }
      void vscode.window.showInformationMessage("Databricks workspace refreshed.");
    }),
    vscode.commands.registerCommand("databricksWorkspace.showAuthProfile", async () => {
      const currentAuthInfo = getAuthInfo();
      log(`Active auth host: ${currentAuthInfo.host}`);
      log(`Active auth profile: ${currentAuthInfo.profile}`);
      if (currentAuthInfo.databricksCliPath) {
        log(`Databricks CLI path: ${currentAuthInfo.databricksCliPath}`);
      }

      const cliText = currentAuthInfo.databricksCliPath
        ? ` | CLI: ${currentAuthInfo.databricksCliPath}`
        : "";
      void vscode.window.showInformationMessage(
        `Host: ${currentAuthInfo.host} | Profile: ${currentAuthInfo.profile}${cliText}`
      );
    }),
    outputChannel
  );

  log("Databricks Workspace Explorer activated.");
}

export function deactivate(): void {}
