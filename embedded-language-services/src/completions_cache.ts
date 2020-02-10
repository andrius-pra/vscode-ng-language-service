import { TemplateContext } from './typescript-template-language-service-decorator';
import * as vscode from 'vscode-languageserver-types';
import * as ts from 'typescript/lib/tsserverlibrary';

export interface HtmlCachedCompletionList {
    type: 'html' | 'css';
    value: vscode.CompletionList;
}

export class CompletionsCache {
    private _cachedCompletionsFile?: string;
    private _cachedCompletionsPosition?: ts.LineAndCharacter;
    private _cachedCompletionsContent?: string;
    private _completions?: HtmlCachedCompletionList;

    public getCached(
        context: TemplateContext,
        position: ts.LineAndCharacter,
    ): HtmlCachedCompletionList | undefined {
        if (this._completions
            && context.fileName === this._cachedCompletionsFile
            && this._cachedCompletionsPosition && this.arePositionsEqual(position, this._cachedCompletionsPosition)
            && context.text === this._cachedCompletionsContent
        ) {
            return this._completions;
        }

        return undefined;
    }

    public updateCached(
        context: TemplateContext,
        position: ts.LineAndCharacter,
        completions: HtmlCachedCompletionList,
    ) {
        this._cachedCompletionsFile = context.fileName;
        this._cachedCompletionsPosition = position;
        this._cachedCompletionsContent = context.text;
        this._completions = completions;
    }

    private arePositionsEqual(
        left: ts.LineAndCharacter,
        right: ts.LineAndCharacter,
    ): boolean {
        return left.line === right.line && left.character === right.character;
    }
}
