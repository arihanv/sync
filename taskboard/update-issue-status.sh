#!/bin/bash

# Linear Issue Status Updater
# Usage: ./update-issue-status.sh <issue_id> <status>
# status options: "complete" or "progress"

if [ $# -ne 2 ]; then
    echo "Usage: $0 <issue_id> <status>"
    echo "Status options: complete, progress"
    exit 1
fi

ISSUE_ID="$1"
STATUS="$2"

if [[ "$STATUS" != "complete" && "$STATUS" != "progress" ]]; then
    echo "Error: Status must be either 'complete' or 'progress'"
    exit 1
fi

# Create a temporary TypeScript file to execute the function in the current directory
SCRIPT_DIR="$(dirname "$0")"
TEMP_FILE="${SCRIPT_DIR}/temp-update-issue-${ISSUE_ID}-${STATUS}.ts"

cat > "$TEMP_FILE" << 'EOF'
import { markIssueAsComplete, markIssueAsInProgress } from "./utils";

async function updateIssueStatus() {
    const issueId = process.argv[2];
    const status = process.argv[3];
    
    try {
        let result;
        if (status === "complete") {
            result = await markIssueAsComplete(issueId);
            console.log(result ? `✅ Issue ${issueId} marked as complete` : `❌ Failed to mark issue ${issueId} as complete`);
        } else if (status === "progress") {
            result = await markIssueAsInProgress(issueId);
            console.log(result ? `🔄 Issue ${issueId} marked as in progress` : `❌ Failed to mark issue ${issueId} as in progress`);
        }
        
        process.exit(result ? 0 : 1);
    } catch (error) {
        console.error(`Error updating issue ${issueId}:`, error);
        process.exit(1);
    }
}

updateIssueStatus();
EOF

# Execute the TypeScript file with bun
echo "Updating issue $ISSUE_ID to status: $STATUS"
cd "$SCRIPT_DIR" && bun run "$TEMP_FILE" "$ISSUE_ID" "$STATUS"

# Store the exit code
EXIT_CODE=$?

# Clean up temporary file
rm -f "$TEMP_FILE"

# Exit with the same code as the bun execution
exit $EXIT_CODE