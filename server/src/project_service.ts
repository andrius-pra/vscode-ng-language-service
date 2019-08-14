import * as ts from 'typescript/lib/tsserverlibrary';
import * as lsp from 'vscode-languageserver';
import {tsDiagnosticToLspDiagnostic} from './diagnostic';
import {filePathToUri} from './utils';

export class ProjectService {
  public readonly tsProjSvc: ts.server.ProjectService;

  constructor(
    private readonly serverHost: ts.server.ServerHost,
    private readonly logger: ts.server.Logger,
    private readonly connection: lsp.IConnection,
  ) {
    const pluginProbeLocation = serverHost.getCurrentDirectory();
    connection.console.info(`Angular LS probe location: ${pluginProbeLocation}`);

    this.tsProjSvc = new ts.server.ProjectService({
      host: serverHost,
      logger,
      cancellationToken: ts.server.nullCancellationToken,
      useSingleInferredProject: true,
      useInferredProjectPerProjectRoot: true,
      typingsInstaller: ts.server.nullTypingsInstaller,
      suppressDiagnosticEvents: false,
      eventHandler: (e) => this.handleProjectServiceEvent(e),
      globalPlugins: ['@angular/language-service'],
      pluginProbeLocations: [pluginProbeLocation],
      allowLocalPluginLoads: false,	// do not load plugins from tsconfig.json
    });

    this.tsProjSvc.configurePlugin({
      pluginName: '@angular/language-service',
      configuration: {
        'angularOnly': true,
      },
    });

    const globalPlugins = this.tsProjSvc.globalPlugins;
    if (globalPlugins.includes('@angular/language-service')) {
      connection.console.info('Success: @angular/language-service loaded');
    }
    else {
      connection.console.error('Failed to load @angular/language-service');
    }
  }

  getDefaultProjectForScriptInfo(info: ts.server.ScriptInfo): ts.server.Project | undefined {
    let project = this.tsProjSvc.getDefaultProjectForFile(
      info.fileName,
      false // ensureProject
    );

    if (!project || project.projectKind !== ts.server.ProjectKind.Configured) {
      const {configFileName} = this.tsProjSvc.openClientFile(info.fileName);
      if (!configFileName) {
        // Failed to find a config file. There is nothing we could do.
        return;
      }
      project = this.tsProjSvc.findProject(configFileName);
      if (!project) {
        return;
      }
      info.detachAllProjects();
      info.attachToProject(project);
    }

    return project;
  }

  private handleProjectServiceEvent(event: ts.server.ProjectServiceEvent) {
    if (event.eventName !== ts.server.ProjectsUpdatedInBackgroundEvent) {
      return;
    }
    // ProjectsUpdatedInBackgroundEvent is sent whenever diagnostics are requested
    // via project.refreshDiagnostics()
    const {openFiles} = event.data;
    for (const fileName of openFiles) {
      const scriptInfo = this.tsProjSvc.getScriptInfo(fileName);
      if (!scriptInfo) {
        continue;
      }
      const project = this.getDefaultProjectForScriptInfo(scriptInfo);
      if (!project) {
        continue;
      }
      const ngLS = project.getLanguageService();
      const diagnostics = ngLS.getSemanticDiagnostics(fileName);
      // Need to send diagnostics even if it's empty otherwise editor state will
      // not be updated.
      this.connection.sendDiagnostics({
        uri: filePathToUri(fileName),
        diagnostics: diagnostics.map(d => tsDiagnosticToLspDiagnostic(d, scriptInfo)),
      });
    }
  }
}
