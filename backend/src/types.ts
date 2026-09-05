export type EmailJob = { emailId:string; userId:string; sender:string; recipient:string; subject:string; body:string; scheduledAt:string; minDelayMs:number; hourlyLimit?:number };
