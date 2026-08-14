import urllib.request
import json
import os
import time
import sys

headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
    'X-GitHub-Api-Version': '2022-11-28',
}

def get_runs():
    url = 'https://api.github.com/repos/hugging-phace/HiWay/actions/runs?event=workflow_dispatch&per_page=5'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def main():
    runs = get_runs()
    run = None
    for r in runs['workflow_runs']:
        if r['name'] == 'Release Onward' and r['status'] != 'completed':
            run = r
            break
    if not run:
        print('No in-progress Release Onward run found')
        for r in runs['workflow_runs']:
            print(r['name'], r['status'], r['conclusion'], r['html_url'])
        return
    print('Monitoring run:', run['html_url'])
    while True:
        time.sleep(30)
        url = f"https://api.github.com/repos/hugging-phace/HiWay/actions/runs/{run['id']}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read().decode())
        print(data['status'], data.get('conclusion'))
        if data['status'] == 'completed':
            print('Run completed:', data['conclusion'])
            print(data['html_url'])
            sys.exit(0 if data['conclusion'] == 'success' else 1)

if __name__ == '__main__':
    main()
