import urllib.request
import json
import os
import sys

tag = sys.argv[1] if len(sys.argv) > 1 else 'v1.0.25'
body = sys.argv[2] if len(sys.argv) > 2 else ''

headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
}

url = f'https://api.github.com/repos/hugging-phace/HiWay/releases/tags/{tag}'
req = urllib.request.Request(url, headers=headers, method='GET')
with urllib.request.urlopen(req) as r:
    release = json.loads(r.read().decode())

new_body = body
patch = {'body': new_body}
patch_url = f"https://api.github.com/repos/hugging-phace/HiWay/releases/{release['id']}"
patch_req = urllib.request.Request(patch_url, data=json.dumps(patch).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(patch_req) as r:
    print('Updated release', r.status)
