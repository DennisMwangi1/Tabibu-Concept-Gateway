import type { AdminUser } from "../middleware/requireAuth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AdminUser;
    }
  }
}

export {};
