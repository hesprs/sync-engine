# Local Testing

This document specifies how to test services locally and simulate real network conditions.

## WebDAV

```sh
rclone serve webdav /home/hesprs/Desktop/DAV --addr :5000
```

- Server URL: `http://localhost:5005`
- Any username and password

## S3

Run RustFS in one terminal:

```sh
mkdir $HOME/Desktop/S3

RUSTFS_ADDRESS=":5005" \
RUSTFS_VOLUMES="$HOME/Desktop/S3" \
RUSTFS_ACCESS_KEY="syncengine2026" \
RUSTFS_SECRET_KEY="rustfs-test-secret" \
rustfs
```

In a second terminal, create the bucket:

```sh
export AWS_ACCESS_KEY_ID="syncengine2026"
export AWS_SECRET_ACCESS_KEY="rustfs-test-secret"
export AWS_DEFAULT_REGION="us-east-1"
awscli2 s3api create-bucket --bucket obsidian-sync --endpoint-url http://127.0.0.1:5005
```

- Endpoint: `http://127.0.0.1:5005`
- Region: `us-east-1`
- Bucket: `obsidian-sync`
- Access key ID: `syncengine2026`
- Path-style URLs
- Secret access key: `rustfs-test-secret`

## Artificial Latency and Bandwidth

- 100ms latency per direction
- 3MiB/s inbound (client uploads)
- 5MiB/s outbound (client downloads)

```sh
sudo tc qdisc add dev lo root handle 1: prio
sudo tc qdisc add dev lo parent 1:1 handle 10: netem delay 100ms rate 24576kbit
sudo tc qdisc add dev lo parent 1:2 handle 20: netem delay 100ms rate 40960kbit
sudo tc filter add dev lo protocol ip parent 1: prio 1 u32 match ip dport 5005 0xffff flowid 1:1
sudo tc filter add dev lo protocol ip parent 1: prio 2 u32 match ip sport 5005 0xffff flowid 1:2
```

Remove all shaping:

```sh
sudo tc qdisc del dev lo root
```
