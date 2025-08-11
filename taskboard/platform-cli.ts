#!/usr/bin/env bun

/**
 * Cross Platform Coordination CLI Tool
 * Test and manage cross-platform worker dispatch capabilities
 */

import { getPlatformStatus, dispatchToWorker, validatePlatformConfig, type PlatformConfig } from "./platform-coordinator";

async function showPlatformStatus() {
    console.log("🔍 Cross Platform Coordination Status");
    console.log("=====================================");
    
    try {
        const status = await getPlatformStatus();
        
        console.log(`🤖 Detected Platform: ${status.detected.toUpperCase()}`);
        console.log(`💡 Recommendation: ${status.recommendation.toUpperCase()}`);
        console.log("");
        
        console.log("📍 Platform Availability:");
        console.log(`  Local:  ${status.local.available ? '✅' : '❌'} Available`);
        if (status.local.available && status.local.tmuxSessions !== undefined) {
            console.log(`          ${status.local.tmuxSessions} claude-worker sessions detected`);
        }
        
        console.log(`  Modal:  ${status.modal.available ? '✅' : '❌'} Available`);
        if (status.modal.host) {
            console.log(`          Host: ${status.modal.host}`);
        }
        
    } catch (error) {
        console.error("❌ Error retrieving platform status:", error);
    }
}

async function testDispatch(workerNum: number, platform: 'local' | 'modal' | 'auto' = 'auto') {
    console.log(`🧪 Testing worker dispatch to worker ${workerNum} on ${platform} platform`);
    
    const testPrompt = "You are testing cross-platform coordination. Please output 'TEST_COMPLETE: COORDINATION_SUCCESS' and exit.";
    const testIssueId = `TEST-${Date.now()}`;
    
    try {
        const result = await dispatchToWorker(workerNum, testPrompt, testIssueId, {
            mode: platform
        });
        
        if (result.success) {
            console.log(`✅ Dispatch successful on ${result.platform} platform`);
        } else {
            console.log(`❌ Dispatch failed: ${result.error}`);
        }
    } catch (error) {
        console.error(`❌ Test dispatch failed:`, error);
    }
}

function showUsage() {
    console.log("Cross Platform Coordination CLI");
    console.log("===============================");
    console.log("");
    console.log("Usage: bun platform-cli.ts <command> [options]");
    console.log("");
    console.log("Commands:");
    console.log("  status                    Show platform status and capabilities");
    console.log("  test <worker>             Test dispatch to worker number (1-4)");
    console.log("  test <worker> <platform>  Test dispatch to specific platform (local|modal|auto)");
    console.log("");
    console.log("Examples:");
    console.log("  bun platform-cli.ts status");
    console.log("  bun platform-cli.ts test 1");
    console.log("  bun platform-cli.ts test 2 local");
    console.log("  bun platform-cli.ts test 3 modal");
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        showUsage();
        return;
    }
    
    const command = args[0];
    
    switch (command) {
        case 'status':
            await showPlatformStatus();
            break;
            
        case 'test':
            if (args.length < 2) {
                console.error("❌ Worker number is required for test command");
                showUsage();
                return;
            }
            
            const workerNum = parseInt(args[1]);
            if (isNaN(workerNum) || workerNum < 1 || workerNum > 4) {
                console.error("❌ Worker number must be between 1 and 4");
                return;
            }
            
            const platform = args[2] as 'local' | 'modal' | 'auto' || 'auto';
            if (!['local', 'modal', 'auto'].includes(platform)) {
                console.error("❌ Platform must be 'local', 'modal', or 'auto'");
                return;
            }
            
            await testDispatch(workerNum, platform);
            break;
            
        default:
            console.error(`❌ Unknown command: ${command}`);
            showUsage();
            break;
    }
}

if (import.meta.main) {
    main().catch(console.error);
}