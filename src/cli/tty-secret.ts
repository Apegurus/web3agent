export class TtySecretError extends Error {
  readonly exitCode: number;
  readonly errorCode: string;

  constructor(code: string, message: string, exitCode = 1) {
    super(message);
    this.name = "TtySecretError";
    this.errorCode = code;
    this.exitCode = exitCode;
  }
}

export function isInteractiveTty(): boolean {
  return (
    process.stdin.isTTY === true && process.stdout.isTTY === true && process.stderr.isTTY === true
  );
}

export function assertInteractiveTty(): void {
  if (!isInteractiveTty()) {
    throw new TtySecretError(
      "LOCAL_TTY_REQUIRED",
      "This command requires an interactive terminal with stdin, stdout, and stderr all attached to a TTY. Secret material cannot be displayed in piped, redirected, or non-interactive environments."
    );
  }
}

export function assertNoJsonModeForSecrets(args: string[]): void {
  if (args.includes("--json")) {
    throw new TtySecretError(
      "JSON_MODE_FORBIDDEN",
      "Secret material cannot be included in --json output. Remove the --json flag to display secrets interactively."
    );
  }
}

export function writeSecretToTty(label: string, secret: string): void {
  assertInteractiveTty();
  process.stderr.write(`${label}: ${secret}\n`);
}
