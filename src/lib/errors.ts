export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 500,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/**
 * Thrown when an OCL collection export is still being generated.
 * Maps to HTTP 503 with a Retry-After header so sync clients back off and retry.
 */
export class ExportNotReadyError extends AppError {
  constructor(
    public readonly collection: string,
    public readonly version: string,
    public readonly retryAfterSeconds = 30,
  ) {
    super(
      `Export for ${collection}@${version} is still generating — retry in ${retryAfterSeconds}s`,
      503,
      "EXPORT_NOT_READY",
    );
    this.name = "ExportNotReadyError";
  }
}
