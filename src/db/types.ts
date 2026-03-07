import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { sessionAppUsage, sessions } from "./schema";

export type SessionRow = InferSelectModel<typeof sessions>;
export type NewSessionRow = InferInsertModel<typeof sessions>;

export type SessionAppUsageRow = InferSelectModel<typeof sessionAppUsage>;
export type NewSessionAppUsageRow = InferInsertModel<typeof sessionAppUsage>;
