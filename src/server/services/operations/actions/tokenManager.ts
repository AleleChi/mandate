import crypto from 'crypto';
import { ActionKey, StoredConfirmationToken } from './types';
import { ToolActor } from '../types';

export class ActionTokenManager {
  private tokens: Map<string, StoredConfirmationToken> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMinutes: number = 10) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  /**
   * Generates and stores a new short-lived confirmation token.
   */
  public createToken(params: {
    actor: ToolActor;
    actionKey: ActionKey;
    eventId: string;
    resolvedTargets: any;
    parameters?: any;
  }): StoredConfirmationToken {
    const tokenId = `act_tok_${crypto.randomBytes(16).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();

    const token: StoredConfirmationToken = {
      id: tokenId,
      adminUserId: params.actor.id,
      adminRole: params.actor.role,
      actionKey: params.actionKey,
      eventId: params.eventId,
      resolvedTargets: params.resolvedTargets,
      parameters: params.parameters || {},
      createdAt: now.toISOString(),
      expiresAt,
      executedAt: null,
      status: 'pending'
    };

    this.tokens.set(tokenId, token);
    this.cleanupExpired();
    return token;
  }

  /**
   * Retrieves and validates token constraints against execution context.
   */
  public validateTokenForExecution(
    tokenId: string,
    actor: ToolActor,
    eventId: string
  ): { valid: boolean; token?: StoredConfirmationToken; error?: string } {
    const token = this.tokens.get(tokenId);

    if (!token) {
      return {
        valid: false,
        error: 'The action could not be found or has expired.'
      };
    }

    if (token.status === 'executed') {
      return {
        valid: false,
        error: 'This action has already been completed.'
      };
    }

    if (token.status === 'cancelled') {
      return {
        valid: false,
        error: 'This action was cancelled.'
      };
    }

    const now = Date.now();
    const expiryTime = new Date(token.expiresAt).getTime();
    if (now > expiryTime || token.status === 'expired') {
      token.status = 'expired';
      return {
        valid: false,
        error: 'This action request has expired. Please ask again.'
      };
    }

    // Admin binding check: cannot execute another Admin's token
    if (token.adminUserId !== actor.id) {
      return {
        valid: false,
        error: 'You do not have permission to confirm this action.'
      };
    }

    // Event binding check: token bound to Event A cannot execute on Event B
    if (token.eventId !== eventId) {
      return {
        valid: false,
        error: 'This action was prepared for a different event.'
      };
    }

    return { valid: true, token };
  }

  public markExecuted(tokenId: string): void {
    const token = this.tokens.get(tokenId);
    if (token) {
      token.status = 'executed';
      token.executedAt = new Date().toISOString();
    }
  }

  public markCancelled(tokenId: string, actor: ToolActor): { success: boolean; error?: string } {
    const token = this.tokens.get(tokenId);
    if (!token) {
      return { success: false, error: 'The action could not be found or has expired.' };
    }
    if (token.adminUserId !== actor.id && actor.role !== 'super_admin') {
      return { success: false, error: 'You do not have permission to cancel this action.' };
    }
    token.status = 'cancelled';
    return { success: true };
  }

  public getToken(tokenId: string): StoredConfirmationToken | undefined {
    return this.tokens.get(tokenId);
  }

  public clearAllForTesting(): void {
    this.tokens.clear();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, token] of this.tokens.entries()) {
      if (token.status !== 'pending' || now > new Date(token.expiresAt).getTime()) {
        // Keep executed/cancelled for 5 minutes for idempotency checks, remove older
        const createdTime = new Date(token.createdAt).getTime();
        if (now - createdTime > this.ttlMs * 2) {
          this.tokens.delete(id);
        }
      }
    }
  }
}

export const actionTokenManager = new ActionTokenManager();
