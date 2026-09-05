export type Status='PENDING'|'SCHEDULED'|'SENDING'|'SENT'|'FAILED'|'RESCHEDULED_RATE_LIMIT';
export type Email={id:string;sender:string;recipient:string;subject:string;body:string;scheduledAt:string;status:Status;error?:string;sentAt?:string};
