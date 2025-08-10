import modal
from modal.stream_type import StreamType

app = modal.App(name="testing")
sb = modal.Sandbox.from_id("sb-5TXX5B1wkKoXCuBVYgODRZ")

# p = sb.exec("sshx", "-q", stdout=StreamType.STDOUT, stderr=StreamType.STDOUT)

# p.wait()

# print(p.stdout.read())