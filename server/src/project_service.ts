import * as ts from 'typescript/lib/tsserverlibrary';

export class ProjectService {

  constructor(
    private readonly tsProjSvc: ts.server.ProjectService
  ) {

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
}
