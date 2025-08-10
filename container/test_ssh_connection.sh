#!/bin/bash

# Test SSH connection to Modal sandbox
# Usage: ./test_ssh_connection.sh <host> <port>

HOST=${1:-"localhost"}
PORT=${2:-"22"}

echo "🔑 Testing SSH connection to $HOST:$PORT"
echo "Username: root"
echo "Password: password123"
echo ""

# Test if sshpass is available
if command -v sshpass &> /dev/null; then
    echo "🧪 Testing with sshpass..."
    sshpass -p "password123" ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        root@$HOST -p $PORT \
        "echo 'SSH connection successful!'; whoami; pwd; ls -la"
else
    echo "⚠️  sshpass not found. Install it with: brew install sshpass"
    echo ""
    echo "🔗 Manual SSH command:"
    echo "ssh root@$HOST -p $PORT"
    echo ""
    echo "When prompted for password, enter: password123"
fi 