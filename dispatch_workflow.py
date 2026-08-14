import urllib.request
import json
import sys
import os

tag = sys.argv[1] if len(sys.argv) > 1 else 'v1.0.25'
url = 'https://api.github.com/repos/hugging-phace/HiWay/actions/workflows/release.yml/dispatches'
headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
}
body = json.dumps({'ref': 'main', 'inputs': {'tag': tag}}).encode()
req = urllib.request.Request(url, data=body, headers=headers, method='POST')
with urllib.request.urlopen(req) as resp:
    print(resp.status, resp.read().decode())
