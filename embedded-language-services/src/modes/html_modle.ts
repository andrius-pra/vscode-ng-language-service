import * as ts from 'typescript/lib/tsserverlibrary';
import {getEmmetCompletionParticipants} from 'vscode-emmet-helper';
import {CompletionConfiguration, LanguageService as HTMLLanguageService} from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver-types';

import {HtmlCachedCompletionList} from '../completions_cache';
import {Configuration} from '../configuration';
import {TemplateContext} from '../typescript-template-language-service-decorator';

import {BaseMode} from './base_mode';

export class HtmlMode extends BaseMode {
  constructor(
      protected readonly htmlLanguageService: HTMLLanguageService,
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
    const htmlDoc = this.htmlLanguageService.parseHTMLDocument(document);
    const hover = this.htmlLanguageService.doHover(document, position, htmlDoc);
    return hover ? this.translateHover(hover, position, context) : undefined;
  }

  public getOutliningSpans(
      document: vscode.TextDocument,
      context: TemplateContext,
      ): ts.OutliningSpan[] {
    const ranges = this.htmlLanguageService.getFoldingRanges(document);
    return ranges.map(range => this.translateOutliningSpan(context, range));
  }

  public getFormattingEditsForRange(
      document: vscode.TextDocument,
      context: TemplateContext,
      start: number,
      end: number,
      settings: ts.EditorSettings,
      configuration: Configuration,
      ): ts.TextChange[] {
    if (!configuration?.html?.format?.enable) {
      return [];
    }

    let startPosition = start;
    let endPosition = end;

    // Make sure we don't get rid of leading newline
    const leading = context.text.match(/^\s*\n/);
    if (leading) {
      startPosition += leading[0].length;
    }
    // or any trailing newlines
    const trailing = context.text.match(/\n\s*$/);
    if (trailing) {
      endPosition -= trailing[0].length;
    }

    if (endPosition <= startPosition) {
      return [];
    }

    const range = this.toVsRange(context, startPosition, endPosition);
    const edits = this.htmlLanguageService.format(document, range, {
      ...configuration.html.format,
      tabSize: settings.tabSize,
      insertSpaces: !!settings.convertTabsToSpaces,
    });

    return edits.map(vsedit => this.toTsTextChange(context, vsedit));
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
    const options: CompletionConfiguration = {
      hideAutoCompleteProposals: configuration.html.autoClosingTags,
      html5: configuration.html.suggest.html5,
    };
    const emmetResults: vscode.CompletionList = {isIncomplete: true, items: []};
    const participants =
        [getEmmetCompletionParticipants(document, position, 'html', {}, emmetResults)];
    this.htmlLanguageService.setCompletionParticipants(participants);

    const htmlDocument = this.htmlLanguageService.parseHTMLDocument(document);
    const completionList =
        this.htmlLanguageService.doComplete(document, position, htmlDocument, options);

    if (emmetResults.items.length) {
      // This list is not complete. Further typing should result in recomputing this list.
      completionList.isIncomplete = true;
      completionList.items.push(...emmetResults.items);
    }
    const htmlCompletions: HtmlCachedCompletionList = {
      type: 'html',
      value: completionList,
    };
    return htmlCompletions;
  }
}
