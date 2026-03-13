export interface Web3AgentErrorOptions {
  code: string;
  message: string;
  details?: unknown;
  cause?: unknown;
}

export class Web3AgentError extends Error {
  readonly code: string;
  readonly details?: unknown;
  override readonly cause?: unknown;

  constructor(options: Web3AgentErrorOptions) {
    super(options.message);
    this.name = "Web3AgentError";
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
  }

  static fromUnknown(
    code: string,
    error: unknown,
    fallbackMessage = "Unknown error",
    details?: unknown
  ): Web3AgentError {
    if (error instanceof Web3AgentError) {
      return error;
    }
    if (error instanceof Error) {
      return new Web3AgentError({
        code,
        message: error.message,
        details,
        cause: error,
      });
    }
    return new Web3AgentError({
      code,
      message: typeof error === "string" ? error : fallbackMessage,
      details,
      cause: error,
    });
  }
}
