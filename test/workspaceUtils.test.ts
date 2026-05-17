import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64Content,
  displayNameForObject,
  exportFormatForPath,
  importFormatForPath,
  toDbPath,
  toFileType,
  toWorkspacePathFromUriPath,
} from "../src/workspaceUtils";

test("toDbPath normalizes missing leading slash", () => {
  assert.equal(toDbPath("Users/me"), "/Users/me");
});

test("toDbPath keeps root slash", () => {
  assert.equal(toDbPath("/"), "/");
});

test("toFileType maps DIRECTORY to directory", () => {
  assert.equal(toFileType("DIRECTORY"), "directory");
});

test("toFileType maps NOTEBOOK/FILE to file", () => {
  assert.equal(toFileType("NOTEBOOK"), "file");
  assert.equal(toFileType("FILE"), "file");
});

test("displayNameForObject adds .ipynb for notebooks", () => {
  assert.equal(displayNameForObject("/Users/me/Test Notebook", "NOTEBOOK"), "Test Notebook.ipynb");
});

test("toWorkspacePathFromUriPath strips .ipynb suffix", () => {
  assert.equal(toWorkspacePathFromUriPath("/Users/me/Test Notebook.ipynb"), "/Users/me/Test Notebook");
});

test("exportFormatForPath returns JUPYTER for notebook .ipynb path", () => {
  assert.equal(exportFormatForPath("/Users/me/Test.ipynb", "NOTEBOOK"), "JUPYTER");
});

test("exportFormatForPath returns SOURCE for notebook non-ipynb path", () => {
  assert.equal(exportFormatForPath("/Users/me/Test Notebook", "NOTEBOOK"), "SOURCE");
});

test("importFormatForPath returns SOURCE for script path", () => {
  assert.equal(importFormatForPath("/Users/me/test.py"), "SOURCE");
});

test("decodeBase64Content decodes utf-8 content", () => {
  const bytes = decodeBase64Content(Buffer.from("hello", "utf8").toString("base64"));
  assert.equal(Buffer.from(bytes).toString("utf8"), "hello");
});
