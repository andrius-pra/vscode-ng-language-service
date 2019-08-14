import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript/lib/tsserverlibrary';

function noop(_?: {} | null | undefined): void { } // tslint:disable-line no-empty

function nowString() {
  // E.g. "12:34:56.789"
  const d = new Date();
  return `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()}`;
}

export function createLogger(options: Map<string, string>) {
  const logFile = options.get('logFile') || path.join(fs.mkdtempSync('ng_'), 'ngserver.log');
  const logVerbosity = options.get('logVerbosity') || 'normal';
  let logLevel: ts.server.LogLevel;
  switch (logVerbosity) {
    case 'terse':
      logLevel = ts.server.LogLevel.terse;
      break;
    case 'requestTime':
      logLevel = ts.server.LogLevel.requestTime;
      break;
    case 'verbose':
      logLevel = ts.server.LogLevel.verbose;
      break;
    case 'normal':
    default:
      logLevel = ts.server.LogLevel.terse;
      break;
  }
  return new Logger(logFile, false /* traceToConsole */, logLevel);
}

export class Logger implements ts.server.Logger {
  private fd = -1;
  private seq = 0;
  private inGroup = false;
  private firstInGroup = true;

  constructor(private readonly logFilename: string,
      private readonly traceToConsole: boolean,
      private readonly level: ts.server.LogLevel) {
      if (this.logFilename) {
          try {
              this.fd = fs.openSync(this.logFilename, "w");
          }
          catch (_) {
              // swallow the error and keep logging disabled if file cannot be opened
          }
      }
  }

  static padStringRight(str: string, padding: string) {
      return (str + padding).slice(0, padding.length);
  }

  close() {
      if (this.fd >= 0) {
          fs.close(this.fd, noop);
      }
  }

  getLogFileName() {
      return this.logFilename;
  }

  perftrc(s: string) {
      this.msg(s, ts.server.Msg.Perf);
  }

  info(s: string) {
      this.msg(s, ts.server.Msg.Info);
  }

  err(s: string) {
      this.msg(s, ts.server.Msg.Err);
  }

  startGroup() {
      this.inGroup = true;
      this.firstInGroup = true;
  }

  endGroup() {
      this.inGroup = false;
  }

  loggingEnabled() {
      return !!this.logFilename || this.traceToConsole;
  }

  hasLevel(level: ts.server.LogLevel) {
      return this.loggingEnabled() && this.level >= level;
  }

  msg(s: string, type: ts.server.Msg = ts.server.Msg.Err) {
      if (!this.canWrite) return;

      s = `[${nowString()}] ${s}\n`;
      if (!this.inGroup || this.firstInGroup) {
          const prefix = Logger.padStringRight(type + " " + this.seq.toString(), "          ");
          s = prefix + s;
      }
      this.write(s);
      if (!this.inGroup) {
          this.seq++;
      }
  }

  private get canWrite() {
      return this.fd >= 0 || this.traceToConsole;
  }

  private write(s: string) {
      if (this.fd >= 0) {
          const buf = Buffer.from(s);
          // tslint:disable-next-line no-null-keyword
          fs.writeSync(this.fd, buf, 0, buf.length, /*position*/ null!); // TODO: GH#18217
      }
      if (this.traceToConsole) {
          console.warn(s);
      }
  }
}

export class DummyLogger implements ts.server.Logger {

  // constructor(logger: Connection)

  close() {

  }

  hasLevel(level: ts.server.LogLevel): boolean {
    return false;
  }

  loggingEnabled(): boolean {
    return true;
  }

  perftrc(s: string): void {

  }

  info(s: string): void {

  }

  startGroup(): void {

  }

  endGroup(): void {

  }

  msg(s: string, type?: ts.server.Msg): void {

  }

  getLogFileName(): string | undefined {
    return;
  }


}
