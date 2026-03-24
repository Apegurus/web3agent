export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function failJson(code: string, message: string): never {
  writeJson({
    ok: false,
    error: {
      code,
      message,
    },
  });
  process.exit(1);
}
