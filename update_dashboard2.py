with open('frontend/src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    '1px solid \n                        : "1px solid #e4e4e7"',
    '1px solid \\n                        : "1px solid #e4e4e7"'
)

text = text.replace(
    'border: isSelected ? 2px solid  : "1px solid #e2e8f0"',
    'border: isSelected ? 2px solid \ : "1px solid #e2e8f0"'
)

with open("frontend/src/pages/Dashboard.tsx", "w", encoding="utf-8") as f:
    f.write(text)
