export type FieldErrors = Record<string, string>;

export type FailureClass =
  | "TRANSIENT"
  | "VALIDATION"
  | "CONFLICT"
  | "AUTHORIZATION"
  | "UNKNOWN"
  | "STORAGE";

export type ErrorBody = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type Result<T> =
  | { ok: true; data: T; meta?: { idempotent?: boolean } }
  | { ok: false; status: number; error: ErrorBody; failureClass?: FailureClass };

export function ok<T>(data: T, meta?: { idempotent?: boolean }): Result<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function fail(
  status: number,
  code: string,
  message: string,
  failureClass?: FailureClass,
  details?: Record<string, unknown>,
): Result<never> {
  return {
    ok: false,
    status,
    failureClass,
    error: details ? { code, message, details } : { code, message },
  };
}
