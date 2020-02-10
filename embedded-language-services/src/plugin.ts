// Licensed under the MIT License.
// Original code forked from https://github.com/microsoft/typescript-lit-html-plugin

import * as ts from 'typescript/lib/tsserverlibrary';
import { Configuration } from './configuration';
import { getLanguageService } from 'vscode-html-languageservice';
import { getCSSLanguageService } from 'vscode-css-languageservice';
import { LanguageService } from './language_service';
import { VirtualDocumentProvider } from './virtual_document_provider';
import {
    decorateWithTemplateLanguageService,
    TemplateSettings,
} from './typescript-template-language-service-decorator';
import { LanguageServiceLogger } from './language_service_logger';

const pluginSymbol = Symbol('__typescript-angular-embedded-service-plugin__');

export class TypescriptPlugin {
    private readonly _config = new Configuration();
    private readonly _cssLanguageService = getCSSLanguageService();
    private readonly _htmlLanguageService = getLanguageService();
    private readonly _virtualDocumentProvider = new VirtualDocumentProvider();
    public constructor(private readonly _typescript: typeof ts) { }

    public create(info: ts.server.PluginCreateInfo): ts.LanguageService {
        const logger = new LanguageServiceLogger(info);

        if ((info.languageService as any)[pluginSymbol]) {
            // Already decorated
            return info.languageService;
        }

        this.onConfigurationChanged(info.config);

        const htmlTemplateLanguageService = new LanguageService(
            this._typescript,
            this._config,
            this._virtualDocumentProvider,
            this._htmlLanguageService,
            this._cssLanguageService,
        );

        const languageService = decorateWithTemplateLanguageService(
            this._typescript,
            info.languageService,
            info.project,
            htmlTemplateLanguageService,
            this.getTemplateSettings(this._config, this._virtualDocumentProvider),
            { logger });
        return languageService;
    }

    public onConfigurationChanged(config: any) {
        this._config.update(config);
        this._cssLanguageService.configure(this._config.css);
    }

    private getTemplateSettings(
        config: Configuration,
        provider: VirtualDocumentProvider,
    ): TemplateSettings {
        return {
            tags: [],
            enableForStringWithSubstitutions: false,
            getSubstitution: undefined,
            getSubstitutions: undefined,
            IsTemplateLiteral: (typescript, node) => {
                if (typescript.isPropertyAssignment(node.parent) && node.parent.name.getText() === 'template') {
                    return true;
                }
                if (typescript.isArrayLiteralExpression(node.parent) &&
                    typescript.isPropertyAssignment(node.parent.parent) &&
                    node.parent.parent.name.getText() === 'styles') {
                    return true;
                }
                return false;
            },
        };
    }
}
