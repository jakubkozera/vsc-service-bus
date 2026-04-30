import * as vscode from 'vscode';
import type { AccessToken, TokenCredential, GetTokenOptions } from '@azure/core-auth';
import { Logger } from '../logging/logger';

/**
 * Service Bus AAD scope (resource = https://servicebus.azure.net).
 * Service Bus AAD tokens are issued for this audience.
 */
export const SERVICE_BUS_SCOPE = 'https://servicebus.azure.net/.default';

/**
 * TokenCredential backed by VS Code's built-in `microsoft` authentication
 * provider. Tokens / refresh tokens are persisted by VS Code in the OS
 * keychain, so the user is NOT re-prompted on each VS Code restart — only
 * when the refresh token actually expires or is revoked.
 *
 * Tenant routing is done via the magic `VSCODE_TENANT:<tenantId>` scope
 * understood by VS Code's Microsoft auth provider.
 */
export class VsCodeMicrosoftCredential implements TokenCredential {
    constructor(private readonly tenantId?: string) {}

    async getToken(scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken | null> {
        // The @azure/service-bus AMQP layer may pass arbitrary audiences as
        // "scopes" (e.g. the namespace URL). VS Code's microsoft provider only
        // understands AAD-style scopes, so we ALWAYS request the canonical
        // Service Bus scope and let the SB service accept the resulting token.
        const requested = Array.isArray(scopes) ? scopes.join(',') : scopes;

        const scopeArr: string[] = [SERVICE_BUS_SCOPE];
        if (this.tenantId && this.tenantId.trim()) {
            scopeArr.push(`VSCODE_TENANT:${this.tenantId.trim()}`);
        }

        try {
            // First try silent — do not prompt UI on background SDK refreshes.
            let session = await vscode.authentication.getSession('microsoft', scopeArr, {
                silent: true
            });
            if (!session) {
                Logger.debug(`[Auth] No silent session, prompting (requested=${requested})`);
                session = await vscode.authentication.getSession('microsoft', scopeArr, {
                    createIfNone: true
                });
            }
            if (!session) {
                Logger.warn(`[Auth] getSession returned null for scope ${requested}`);
                return null;
            }
            // Report a conservative validity. The SDK will call us again before
            // expiry; getSession transparently refreshes via the OS keychain.
            return {
                token: session.accessToken,
                expiresOnTimestamp: Date.now() + 50 * 60 * 1000
            };
        } catch (e) {
            Logger.error(`[Auth] getToken failed for scope ${requested}`, e);
            throw e;
        }
    }

    /**
     * Force interactive sign-in for this tenant, e.g. right after the user
     * creates a new AAD-based namespace, so they don't get a surprise prompt
     * later when they open a queue.
     */
    async signIn(): Promise<void> {
        const scopeArr: string[] = [SERVICE_BUS_SCOPE];
        if (this.tenantId && this.tenantId.trim()) {
            scopeArr.push(`VSCODE_TENANT:${this.tenantId.trim()}`);
        }
        const session = await vscode.authentication.getSession('microsoft', scopeArr, {
            createIfNone: true
        });
        if (!session) {
            throw new Error('Sign-in was cancelled');
        }
        Logger.info(`[Auth] Signed in as ${session.account.label}`);
    }
}
