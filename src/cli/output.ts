export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export class CliExitError extends Error {
  readonly exitCode: number;
  readonly errorCode: string;

  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.name = "CliExitError";
    this.errorCode = code;
    this.exitCode = exitCode;
  }
}

export function failJson(code: string, message: string): never {
  throw new CliExitError(code, message);
}
