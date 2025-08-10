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