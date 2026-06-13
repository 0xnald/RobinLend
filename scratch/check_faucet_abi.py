import urllib.request
import json

api_url = "https://explorer.testnet.chain.robinhood.com/api?module=contract&action=getabi&address=0x8762f93772c663c6a88ba50900bd5381df2717be"

req = urllib.request.Request(
    api_url,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
)

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        status = result.get("status")
        message = result.get("message")
        if status == "1":
            abi_str = result.get("result")
            abi = json.loads(abi_str)
            print("Contract ABI retrieved successfully!")
            # Print function names and inputs
            for item in abi:
                if item.get("type") == "function":
                    name = item.get("name")
                    inputs = [i.get("name") + " (" + i.get("type") + ")" for i in item.get("inputs", [])]
                    print(f"Function: {name}({', '.join(inputs)})")
        else:
            print(f"API Error: {message}")
except Exception as e:
    print(f"Error: {e}")
