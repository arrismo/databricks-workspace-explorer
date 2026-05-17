import * as vscode from "vscode";
import { DatabricksWorkspaceFS } from "./DatabricksWorkspaceFS";

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
