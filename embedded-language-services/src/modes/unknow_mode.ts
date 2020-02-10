import * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-types';

import {HtmlCachedCompletionList} from '../completions_cache';
import {Configuration} from '../configuration';
import {TemplateContext} from '../typescript-template-language-service-decorator';

import {BaseMode} from './base_mode';

export class UnknowMode extends BaseMode {
  constructor(
      typescript: typeof ts,
  ) {
    super(typescript);
  }

  public getCompletionsAtPosition(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
      configuration: Configuration,
      ): ts.CompletionInfo {
    const entry = this.getCompletionItems(document, context, position, configuration);
    return this.translateCompletionItemsToCompletionInfo(this.typescript, context, entry.value);
  }

  public getCompletionEntryDetails(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
      configuration: Configuration,
      name: string,
      ): ts.CompletionEntryDetails {
    const entry = this.getCompletionItems(document, context, position, configuration);

    const item = entry.value.items.find(x => x.label === name);
    if (!item) {
      return {
        name,
        kind: this.typescript.ScriptElementKind.unknown,
        kindModifiers: '',
        tags: [],
        displayParts: this.toDisplayParts(name),
        documentation: [],
      };
    }
    return this.translateCompletionItemsToCompletionEntryDetails(this.typescript, item);
  }

  public getQuickInfoAtPosition(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
  ) {
    return undefined;
  }

  public getOutliningSpans(
      document: vscode.TextDocument,
      context: TemplateContext,
      ): ts.OutliningSpan[] {
    return [];
  }

  public getFormattingEditsForRange(
      document: vscode.TextDocument,
      context: TemplateContext,
      start: number,
      end: number,
      settings: ts.EditorSettings,
      configuration: Configuration,
      ): ts.TextChange[] {
    return [];
  }

  public getSemanticDiagnostics(
      document: vscode.TextDocument,
      context: TemplateContext,
      configuration: Configuration,
      ): ts.Diagnostic[] {
    return [];
  }

  private getCompletionItems(
      document: vscode.TextDocument,
      context: TemplateContext,
      position: ts.LineAndCharacter,
      configuration: Configuration,
      ): HtmlCachedCompletionList {
    const cached = this._completionsCache.getCached(context, position);
    if (cached) {
      return cached;
    }

    const emptyCompletionList: vscode.CompletionList = {
      isIncomplete: false,
      items: [],
    };
    const htmlCompletions: HtmlCachedCompletionList = {
      type: 'html',
      value: emptyCompletionList,
    };
    return htmlCompletions;
  }
}
