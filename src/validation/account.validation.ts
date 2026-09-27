import { z } from 'zod';

export const accountNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(100, 'Name must be 100 characters or fewer.');
