import os, re
found = False
for root, _, files in os.walk('frontend/src/pages'):
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                # find array definition with objects
                if re.search(r'=\s*\[\s*\{\s*[\'\"]?(id|request_no|project_name)[\'\"]?\s*:', content):
                    print(f'Found hardcoded array in {path}')
                    found = True
if not found:
    print('No hardcoded arrays found')
