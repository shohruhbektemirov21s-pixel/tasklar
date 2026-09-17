import re

with open('frontend/src/pages/ChangeRequests.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    matches = re.finditer(r'=\s*\[\s*\{\s*[\'\"]?\w+[\'\"]?\s*:', content)
    for m in matches:
        start = max(0, m.start() - 50)
        end = min(len(content), m.end() + 200)
        print(f'Match at {m.start()}:\n{content[start:end]}\n---')
