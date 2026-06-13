import urllib.request
import json

rpc_url = "https://rpc.testnet.chain.robinhood.com"
token_addr = "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E"

# eth_call for decimals() is signature 0x313ce567
payload = {
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [
        {
            "to": token_addr,
            "data": "0x313ce567"
        },
        "latest"
    ],
    "id": 1
}

req = urllib.request.Request(
    rpc_url,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        hex_res = result.get("result")
        if hex_res:
            decimals = int(hex_res, 16)
            print(f"Decimals for TSLA ({token_addr}): {decimals}")
        else:
            print("No result.")
except Exception as e:
    print(f"Error: {e}")
