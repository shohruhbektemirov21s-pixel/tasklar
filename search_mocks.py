import os
import re

for root, _, files in os.walk('frontend/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                if re.search(r'=\s*\[\s*\{\s*[\'\"]?(id|title|name)[\'\"]?\s*:', content) or re.search(r'listOf<[^>]+>\([^)]*mock', content, re.I):
                    print(f'Match found in: {path}')
