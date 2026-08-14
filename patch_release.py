import urllib.request
import json
import os

tag = 'v1.0.25'
body_path = '.release-body-v1.0.25.md'

token = os.environ['GITHUB_TOKEN']
headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
}

req = urllib.request.Request(f'https://api.github.com/repos/hugging-phace/HiWay/releases/tags/{tag}', headers=headers)
with urllib.request.urlopen(req) as r:
    release = json.loads(r.read().decode())

with open(body_path, encoding='utf-8') as f:
    body = f.read()

patch = json.dumps({'body': body}).encode()
patch_url = f"https://api.github.com/repos/hugging-phace/HiWay/releases/{release['id']}"
patch_req = urllib.request.Request(patch_url, data=patch, headers=headers, method='PATCH')
with urllib.request.urlopen(patch_req) as r:
    print('Updated release:', r.status)
