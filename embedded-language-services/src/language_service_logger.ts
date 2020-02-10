export class LanguageServiceLogger {
    constructor(
        private readonly info: ts.server.PluginCreateInfo,
    ) { }

    public log(msg: string) {
        // tslint:disable-next-line: max-line-length
        this.info.project.projectService.logger.info(`[typescript-embedded-language-services-for-angular-plugin] ${msg}`);
    }
}
