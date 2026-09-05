import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export const errorHandler:ErrorRequestHandler=(err,_,res,__)=>{ console.error(err); res.status(err instanceof ZodError?400:500).json({error:err instanceof ZodError?'Invalid request': 'Internal server error',details:err instanceof ZodError?err.flatten():undefined}); };
