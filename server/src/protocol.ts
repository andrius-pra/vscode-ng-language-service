// tslint:disable: no-namespace
import { NotificationType } from 'vscode-languageserver';

export namespace ProjectLoadingStartNotification {
  export const type: NotificationType<string, string> =
     new NotificationType('$/angular-language-service/projectLoadingStart');
}

export namespace ProjectLoadingFinishNotification {
  export const type: NotificationType<string, string> =
    new NotificationType('$/angular-language-service/projectLoadingFinish');
}
