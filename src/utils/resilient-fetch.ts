const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "EPIPE",
]);

export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  cooldownMs?: number;
}

export interface ResilientFetchConfig {
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  label?: string;
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  openUntil: number;
  state: "closed" | "open" | "half-open";
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitBreaker(key: string): CircuitBreakerState {
  let cb = circuitBreakers.get(key);
  if (!cb) {
    cb = { consecutiveFailures: 0, openUntil: 0, state: "closed" };
    circuitBreakers.set(key, cb);
  }
  return cb;
}

function jitteredDelay(baseMs: number, attempt: number, maxMs: number): number {
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error && typeof error === "object" && "code" in error) {
    return RETRYABLE_ERROR_CODES.has((error as { code: string }).code);
  }
  return false;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function extractRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function resilientFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: ResilientFetchConfig
): Promise<Response> {
  const maxRetries = config?.retry?.maxRetries ?? 3;
  const baseDelayMs = config?.retry?.baseDelayMs ?? 500;
  const maxDelayMs = config?.retry?.maxDelayMs ?? 10_000;
  const failureThreshold = config?.circuitBreaker?.failureThreshold ?? 5;
  const cooldownMs = config?.circuitBreaker?.cooldownMs ?? 30_000;
  const label = config?.label ?? "default";

  const cb = getCircuitBreaker(label);

  if (cb.state === "open") {
    if (Date.now() < cb.openUntil) {
      throw new Error(
        `[resilient-fetch] Circuit open for "${label}" — cooling down for ${Math.ceil((cb.openUntil - Date.now()) / 1000)}s`
      );
    }
    cb.state = "half-open";
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        const retryAfter = extractRetryAfterMs(response);
        const delay = retryAfter ?? jitteredDelay(baseDelayMs, attempt, maxDelayMs);
        process.stderr.write(
          `[resilient-fetch] ${label}: ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${Math.round(delay)}ms\n`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      cb.consecutiveFailures = 0;
      cb.state = "closed";
      return response;
    } catch (error: unknown) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= maxRetries) {
        cb.consecutiveFailures++;
        if (cb.consecutiveFailures >= failureThreshold) {
          cb.state = "open";
          cb.openUntil = Date.now() + cooldownMs;
          process.stderr.write(
            `[resilient-fetch] Circuit opened for "${label}" after ${cb.consecutiveFailures} failures — cooldown ${cooldownMs}ms\n`
          );
        }
        throw error;
      }

      const delay = jitteredDelay(baseDelayMs, attempt, maxDelayMs);
      process.stderr.write(
        `[resilient-fetch] ${label}: network error on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${Math.round(delay)}ms\n`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

export function resetCircuitBreakers(): void {
  circuitBreakers.clear();
}
