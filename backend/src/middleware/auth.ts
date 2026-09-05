import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

export type AuthenticatedRequest = Request & { auth?: { email:string; name?:string; image?:string } };
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/** Verifies a Google OpenID Connect ID token on every dashboard API request. */
export async function requireGoogleAuth(req:AuthenticatedRequest,res:Response,next:NextFunction) {
  const token=req.header('authorization')?.replace(/^Bearer\s+/i,'') || (typeof req.query.access_token==='string'?req.query.access_token:undefined);
  if(!token) return res.status(401).json({error:'Google sign-in is required'});
  try { const ticket=await google.verifyIdToken({idToken:token,audience:env.GOOGLE_CLIENT_ID}); const p=ticket.getPayload(); if(!p?.email||!p.email_verified) throw new Error('Unverified Google account'); req.auth={email:p.email,name:p.name,image:p.picture}; next(); }
  catch { return res.status(401).json({error:'Your session is invalid or expired. Please sign in again.'}); }
}
