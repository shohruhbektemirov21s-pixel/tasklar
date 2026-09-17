file = 'tests/test_sohaviy_and_analytics.py'
with open(file, 'r', encoding='utf-8') as f:
    text = f.read()

old = 'self.admin = make_user("admin_notif@boshqarma.uz", role=GlobalRole.ADMIN)'
new = 'self.admin = make_user("admin_notif@boshqarma.uz", role=GlobalRole.ADMIN)\n        self.admin.can_access_orders = True\n        self.admin.save()'

if old in text:
    text = text.replace(old, new)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fixed admin!")
else:
    print("Not found!")
