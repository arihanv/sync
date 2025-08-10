#!/bin/bash

# Simple test of Claude launcher

echo "Testing Claude Code headless mode..."

# Create a simple prompt
PROMPT="Create a file called test-output.txt with the content 'Claude was here'. Use the Write tool to actually create the file."

# Run Claude with the prompt
echo "$PROMPT" | claude --print --allowedTools Write --add-dir /Users/akshgarg/Documents/Harmonize

# Check if file was created
if [ -f "test-output.txt" ]; then
    echo "✅ Success! File was created:"
    cat test-output.txt
    rm test-output.txt
    echo "🧹 Cleaned up test file"
else
    echo "❌ File was not created"
fi