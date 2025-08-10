# SSH Connection

Connect to the Modal SSH instance:

```bash
sshpass -p 'modal123' ssh -o ProxyCommand="openssl s_client -quiet -connect YOUR_HOST.modal.host:443" root@YOUR_HOST.modal.host
```

## Prerequisites
- Install `sshpass`: `brew install sshpass` (macOS) or `sudo apt-get install sshpass` (Ubuntu)

## Usage
- Replace `YOUR_PASSWORD` and `YOUR_HOST` with your actual credentials
- Copy and paste the command above to connect
- For remote commands: add your command in quotes at the end

# Make sure to set the IS_SANDBOX environment variable to 1
`export IS_SANDBOX=1`

# Create the tmux sessions
`tmux new -s claude-worker-{worker_number}`

# Attach to the tmux session
`tmux attach -t claude`

# Detach from the tmux session
`Ctrl+b d`

# List all tmux sessions