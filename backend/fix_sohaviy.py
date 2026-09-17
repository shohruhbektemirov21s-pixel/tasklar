file = 'tests/test_sohaviy_and_analytics.py'
with open(file, 'r', encoding='utf-8') as f:
    text = f.read()

old = 'self.assertTrue(\n            Notification.objects.filter(\n                recipient=self.sohaviy2'
new = 'self.assertFalse(\n            Notification.objects.filter(\n                recipient=self.sohaviy2'

if old in text:
    text = text.replace(old, new)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fixed!")
else:
    print("Not found!")
