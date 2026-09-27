import { 
  AppError, 
  InternalError, 
  TimeoutError,
  ValidationError,
} from "./errors.js";

export interface TryCatchResult<T, E extends AppError = AppError> {
  data: T | null;
  error: E | null;
}

export interface AsyncTryCatchResult<T, E extends AppError = AppError> {
  data: T | null;
  error: E | null;
}

export function tryCatch<T, E extends AppError = AppError>(
  fn: () => T,
  errorFactory?: (error: unknown) => E
): TryCatchResult<T, E> {
  try {
    const data = fn();
    return { data, error: null };
  } catch (err: unknown) {
    const error = errorFactory ? errorFactory(err) : toAppError(err);
    return { data: null, error: error as E };
  }
}

export async function tryCatchAsync<T, E extends AppError = AppError>(
  promise: Promise<T>,
  errorFactory?: (error: unknown) => E
): Promise<AsyncTryCatchResult<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (err: unknown) {
    const error = errorFactory ? errorFactory(err) : toAppError(err);
    return { data: null, error: error as E };
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) return new InternalError(error.message, error);
  return new InternalError(String(error));
}

export function tryCatchSync<T, E extends AppError = AppError>(
  fn: () => T,
  options?: {
    onError?: (error: E) => void;
    errorFactory?: (error: unknown) => E;
  }
): T | null {
  try {
    return fn();
  } catch (err: unknown) {
    const error = options?.errorFactory ? options.errorFactory(err) : toAppError(err);
    options?.onError?.(error as E);
    return null;
  }
}

export async function tryCatchPromise<T, E extends AppError = AppError>(
  promise: Promise<T>,
  options?: {
    onError?: (error: E) => void;
    errorFactory?: (error: unknown) => E;
  }
): Promise<T | null> {
  try {
    return await promise;
  } catch (err: unknown) {
    const error = options?.errorFactory ? options.errorFactory(err) : toAppError(err);
    options?.onError?.(error as E);
    return null;
  }
}

export function assertNever(value: never, message = "Unexpected value"): never {
  throw new InternalError(message);
}

export function unreachable(message = "Unreachable code reached"): never {
  throw new InternalError(message);
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
  return result.ok ? result : fn(result.error);
}

export async function tryCatchResult<T, E extends AppError = AppError>(
  promise: Promise<T>,
  errorFactory?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (caughtErr: unknown) {
    const error = errorFactory ? errorFactory(caughtErr) : toAppError(caughtErr);
    return err(error as E);
  }
}

export function combine<E>(results: Result<any, E>[]): Result<any[], E> {
  const values: any[] = [];
  for (const result of results) {
    if (!result.ok) return result as any;
    values.push(result.value);
  }
  return ok(values);
}

export async function tryAll<E>(
  promises: Promise<any>[],
  errorFactory?: (error: unknown) => E
): Promise<Result<any[], E>> {
  return Promise.all(promises.map(p => 
    p.then(v => ok(v)).catch(e => err((errorFactory ? errorFactory(e) : toAppError(e)) as E))
  )).then(results => combine(results));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Operation timed out"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new TimeoutError(message)), ms)
    ),
  ]);
}

export function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2, shouldRetry = () => true } = options;
  
  return new Promise(async (resolve, reject) => {
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error: unknown) {
        lastError = error;
        
        if (attempt === maxAttempts || !shouldRetry(error)) {
          reject(error);
          return;
        }
        
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
    
    reject(lastError);
  });
}