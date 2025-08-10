import modal

# Create a simple Modal image based on the Dockerfile without additional Python setup
harmonize_worker_image = (
    modal.Image.from_dockerfile(
        path="DOCKERFILE",
        build_args={
            "TZ": "UTC",
        },
        add_python="3.10",
    )
    .apt_install(
        "git",
        "curl",
    )
    .run_commands(
        "curl -sSf https://sshx.io/get | sh",
    )
    .add_local_file("init-firewall.sh", "/usr/local/bin/init-firewall.sh")
)

harmonize_worker_app = modal.App(name="harmonize-worker")

base_image = modal.Image.debian_slim(python_version="3.10")
app = modal.App(name="harmonize", image=base_image)

harmonize_app = modal.App.lookup(name="harmonize-worker", create_if_missing=True)


@app.local_entrypoint()
def main():
    with modal.enable_output():
        sandbox = modal.Sandbox.create(
            # "git clone https://github.com/octocat/Hello-World.git",
            # "curl -sSf https://sshx.io/get | sh",
            app=harmonize_app,
            image=harmonize_worker_image,
            secrets=[modal.Secret.from_dotenv(".env")],
            # workdir="/repo",
            verbose=True,
            timeout=60 * 5,
        )

    print(f"🏖️  Sandbox ID: {sandbox.object_id}")
