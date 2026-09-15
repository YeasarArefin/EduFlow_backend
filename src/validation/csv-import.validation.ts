import { z } from 'zod';

export const csvImportSchema = z.object({ csv: z.string().min(1).max(5_000_000) }).strict();
