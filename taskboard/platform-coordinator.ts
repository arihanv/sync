#!/usr/bin/env bun

/**
 * Cross Platform Coordination Layer
 * Automatically detects environment and coordinates Claude worker dispatch across local/remote platforms
 */

import { attachToClaudeWorkerLocal, attachToClaudeWorkerModal, addCommentToIssue } from "./utils";

export interface PlatformConfig {
    mode: 'local' | 'modal' | 'auto';
    modalHost?: string;
    modalPassword?: string;
    localWorkspaceRoot?: string;
    maxRetryAttempts?: number;
}

export interface WorkerDispatchResult {
    success: boolean;
    platform: 'local' | 'modal';
    error?: string;
    workerNumber: number;
}

/**
 * Default platform configuration
 */
const DEFAULT_CONFIG: PlatformConfig = {
    mode: 'auto',
    modalHost: process.env.MODAL_HOST || "4x0z2oj18w6e5z.r443.modal.host",
    modalPassword: process.env.MODAL_PASSWORD || "modal123",
    localWorkspaceRoot: process.env.LOCAL_WORKSPACE_ROOT || "/Users/akshgarg/Documents/try2/Harmonize",
    maxRetryAttempts: 2
};

/**
 * Detects the current platform environment
 */
async function detectPlatform(): Promise<'local' | 'modal'> {
    try {
        // Try to detect if we're in a containerized environment (Modal)
        const dockerEnv = process.env.CONTAINER_ID || process.env.DOCKER_CONTAINER_ID;
        if (dockerEnv) {
            return 'modal';
        }

        // Check if modal SSH connection is available
        if (await testModalConnection()) {
            return 'modal';
        }

        // Check if local tmux is available
        if (await testLocalTmux()) {
            return 'local';
        }

        // Default to local if both fail
        console.warn('Could not detect platform environment, defaulting to local');
        return 'local';
    } catch (error) {
        console.warn('Platform detection failed, defaulting to local:', error);
        return 'local';
    }
}

/**
 * Tests if Modal SSH connection is available
 */
async function testModalConnection(): Promise<boolean> {
    try {
        const host = DEFAULT_CONFIG.modalHost!;
        const testCmd = Bun.spawn([
            "bash", "-c", 
            `timeout 5 sshpass -p '${DEFAULT_CONFIG.modalPassword}' ssh -o ProxyCommand="openssl s_client -quiet -connect ${host}:443" -o ConnectTimeout=3 -o BatchMode=yes root@${host} "echo test" 2>/dev/null`
        ], {
            stdio: ["pipe", "pipe", "pipe"]
        });

        const exitCode = await testCmd.exited;
        return exitCode === 0;
    } catch (error) {
        return false;
    }
}

/**
 * Tests if local tmux is available and functional
 */
async function testLocalTmux(): Promise<boolean> {
    try {
        const testCmd = Bun.spawn(["tmux", "list-sessions"], {
            stdio: ["pipe", "pipe", "pipe"]
        });

        const exitCode = await testCmd.exited;
        return exitCode === 0 || exitCode === 1; // 1 = no sessions, but tmux is working
    } catch (error) {
        return false;
    }
}

/**
 * Cross-platform worker dispatch coordinator
 */
export async function dispatchToWorker(
    workerNum: number,
    prompt: string,
    linearIssueId: string,
    config: PlatformConfig = DEFAULT_CONFIG
): Promise<WorkerDispatchResult> {
    let platform: 'local' | 'modal';
    
    // Determine platform
    if (config.mode === 'auto') {
        platform = await detectPlatform();
    } else {
        platform = config.mode as 'local' | 'modal';
    }

    await addCommentToIssue(linearIssueId, `🎯 Coordinating cross-platform dispatch to worker ${workerNum} on ${platform} platform`);

    let lastError: string | undefined;
    
    for (let attempt = 1; attempt <= (config.maxRetryAttempts ?? 2); attempt++) {
        try {
            console.log(`Attempt ${attempt}: Dispatching to ${platform} worker ${workerNum} for ${linearIssueId}`);
            
            if (platform === 'local') {
                await attachToClaudeWorkerLocal(workerNum, prompt, linearIssueId);
            } else {
                await attachToClaudeWorkerModal(workerNum, prompt, linearIssueId);
            }
            
            await addCommentToIssue(linearIssueId, `✅ Successfully dispatched to ${platform} worker ${workerNum}`);
            
            return {
                success: true,
                platform,
                workerNumber: workerNum
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            lastError = errorMessage;
            
            console.error(`Attempt ${attempt} failed for ${platform} worker ${workerNum}:`, errorMessage);
            
            // Try switching platforms on failure if in auto mode
            if (config.mode === 'auto' && attempt < (config.maxRetryAttempts ?? 2)) {
                platform = platform === 'local' ? 'modal' : 'local';
                await addCommentToIssue(linearIssueId, `⚠️ ${platform === 'modal' ? 'Local' : 'Modal'} dispatch failed, switching to ${platform} platform for retry`);
            }
        }
    }

    // All attempts failed
    await addCommentToIssue(linearIssueId, `❌ Cross-platform dispatch failed after ${config.maxRetryAttempts} attempts: ${lastError}`);
    
    return {
        success: false,
        platform,
        error: lastError,
        workerNumber: workerNum
    };
}

/**
 * Gets current platform status and capabilities
 */
export async function getPlatformStatus(): Promise<{
    detected: 'local' | 'modal';
    local: { available: boolean; tmuxSessions?: number };
    modal: { available: boolean; host?: string };
    recommendation: 'local' | 'modal' | 'unavailable';
}> {
    const [detected, localAvailable, modalAvailable] = await Promise.all([
        detectPlatform(),
        testLocalTmux(),
        testModalConnection()
    ]);

    let tmuxSessions = 0;
    if (localAvailable) {
        try {
            const proc = Bun.spawn(['tmux', 'list-sessions'], { stdout: 'pipe', stderr: 'pipe' });
            await proc.exited;
            const output = new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer());
            tmuxSessions = output.split('\n').filter(line => line.includes('claude-worker-')).length;
        } catch (error) {
            // Ignore tmux session count errors
        }
    }

    let recommendation: 'local' | 'modal' | 'unavailable';
    if (localAvailable && modalAvailable) {
        recommendation = detected; // Use detected platform if both are available
    } else if (localAvailable) {
        recommendation = 'local';
    } else if (modalAvailable) {
        recommendation = 'modal';
    } else {
        recommendation = 'unavailable';
    }

    return {
        detected,
        local: { available: localAvailable, tmuxSessions },
        modal: { available: modalAvailable, host: DEFAULT_CONFIG.modalHost },
        recommendation
    };
}

/**
 * Validates platform configuration
 */
export function validatePlatformConfig(config: PlatformConfig): string[] {
    const errors: string[] = [];

    if (!['local', 'modal', 'auto'].includes(config.mode)) {
        errors.push('Invalid mode: must be "local", "modal", or "auto"');
    }

    if (config.mode === 'modal') {
        if (!config.modalHost) {
            errors.push('Modal host is required when mode is "modal"');
        }
        if (!config.modalPassword) {
            errors.push('Modal password is required when mode is "modal"');
        }
    }

    if (config.maxRetryAttempts !== undefined && (config.maxRetryAttempts < 1 || config.maxRetryAttempts > 5)) {
        errors.push('Max retry attempts must be between 1 and 5');
    }

    return errors;
}

export { DEFAULT_CONFIG };