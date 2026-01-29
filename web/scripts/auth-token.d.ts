export interface TokenPayload { sub: string; exp: number; purpose: string; ep?: number; ua?: string; ip?: string }
export function signToken(payload: TokenPayload, secret: string): string;
export function verifyToken(token: string, secret: string): TokenPayload;
