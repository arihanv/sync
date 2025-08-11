#!/usr/bin/env bun

/**
 * Test script for cross-platform coordination functionality
 */

import { getPlatformStatus, validatePlatformConfig } from "./taskboard/platform-coordinator";

async function runTests() {
    console.log("🧪 Testing Cross Platform Coordination");
    console.log("=====================================\n");
    
    try {
        // Test 1: Platform status detection
        console.log("Test 1: Platform Status Detection");
        const status = await getPlatformStatus();
        console.log("✅ Platform detection successful:");
        console.log(`   Detected: ${status.detected}`);
        console.log(`   Local available: ${status.local.available}`);
        console.log(`   Modal available: ${status.modal.available}`);
        console.log(`   Recommendation: ${status.recommendation}\n`);
        
        // Test 2: Config validation
        console.log("Test 2: Configuration Validation");
        const validConfig = { mode: 'auto' as const };
        const invalidConfig = { mode: 'invalid' as any };
        
        const validErrors = validatePlatformConfig(validConfig);
        const invalidErrors = validatePlatformConfig(invalidConfig);
        
        if (validErrors.length === 0) {
            console.log("✅ Valid config validation passed");
        } else {
            console.log("❌ Valid config validation failed:", validErrors);
        }
        
        if (invalidErrors.length > 0) {
            console.log("✅ Invalid config properly rejected:", invalidErrors[0]);
        } else {
            console.log("❌ Invalid config should have been rejected");
        }
        
        console.log("\n🎉 Cross Platform Coordination tests completed successfully!");
        
    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

if (import.meta.main) {
    runTests();
}