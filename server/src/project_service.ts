import * as tss from 'typescript/lib/tsserverlibrary';

export class ProjectService {

  constructor(
    private readonly tsProjSvc: tss.server.ProjectService
  ) {

  }

  getDefaultProjectForScriptInfo(info: tss.server.ScriptInfo): tss.server.Project | undefined {
    let project = this.tsProjSvc.getDefaultProjectForFile(
      info.fileName,
      false // ensureProject
    );

    if (!project || project.projectKind !== tss.server.ProjectKind.Configured) {
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
