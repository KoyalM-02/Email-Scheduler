import type { NextFunction, Request, Response } from 'express';
/** Express 4 does not automatically forward rejected async route handlers to error middleware. */
export const asyncRoute=(handler:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void handler(req,res,next).catch(next)};
