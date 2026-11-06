import { promisify } from 'node:util';
import { pbkdf2, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Database } from './db.js';
import type { Person } from './models.js';
const derive = promisify(pbkdf2);
export const COOKIE = 'pastoral_session';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function demand(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = await derive(password, salt, 200000, 32, 'sha256');
  return `${salt}$${digest.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split('$');
  if (!salt || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  const digest = await derive(password, salt, 200000, 32, 'sha256');
  return timingSafeEqual(digest, Buffer.from(hash, 'hex'));
}
export function sessionToken(req: Request) {
  return req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const cookieOptions = () => ({httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/'});
export async function startSession(db: Database, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query('DELETE FROM sessions WHERE expires_at<=now()');
  await db.query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [tokenHash(token), userId]);
  res.cookie(COOKIE, token, {...cookieOptions(), maxAge: 30 * 86400000});
}
export async function logout(db: Database, req: Request, res: Response) {
  const token = sessionToken(req);
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
  res.clearCookie(COOKIE, cookieOptions());
}
export async function currentUser(db: Database, req: Request) {
  const token = sessionToken(req);
  demand(token, 401, 'Não autenticado');
  const [user] = await db.query<Person>(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`, [tokenHash(token)]);
  demand(user, 401, 'Sessão expirada ou usuário inativo');
  const [seen] = await db.query<{last_seen_at: string}>(`UPDATE users SET last_seen_at=now()
    WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at<now()-interval '2 minutes') RETURNING last_seen_at`, [user.id]);
  if (seen) user.last_seen_at = seen.last_seen_at;
  return user;
}
export function requireLeader(user: Person) { demand(user.role !== 'membro', 403, 'Permissão negada'); }
export function requireCoordinator(user: Person) { demand(user.role === 'coordenador', 403, 'Permissão negada'); }
export function inScope(principal: Person, target: Person) {
  return principal.role === 'coordenador' || (principal.role === 'subcoordenador' && target.sector_ids.some(s => principal.coordinated_sector_ids.includes(s)));
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {timeZone: process.env.APP_TZ || 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
