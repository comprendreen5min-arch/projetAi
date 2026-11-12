import urllib.request
import json

def fetch_json(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        return response.getcode(), json.loads(response.read().decode('utf-8'))

def main():
    base = 'http://localhost:8000/api/v1'
    code, datasets = fetch_json(f'{base}/datasets/')
    print(f'Datasets found: {len(datasets)}')
    for ds in datasets:
        ds_id = ds['id']
        c_cfg, cfg = fetch_json(f'{base}/training/{ds_id}/config')
        c_head, head = fetch_json(f'{base}/training/{ds_id}/header')
        c_runs, runs = fetch_json(f'{base}/training/{ds_id}/runs')
        c_comp, comp = fetch_json(f'{base}/training/{ds_id}/compare')
        print(f"DS: {ds['name']} -> cfg: {c_cfg}, head: {c_head}, runs: {len(runs)}, comp: {c_comp}")
        if runs:
            r_id = runs[0]['id']
            c_det, detail = fetch_json(f'{base}/training/runs/{r_id}')
            print(f"  Run detail for {runs[0]['run_name']}: {c_det}, recall: {detail.get('recall_yes')}")

if __name__ == '__main__':
    main()
