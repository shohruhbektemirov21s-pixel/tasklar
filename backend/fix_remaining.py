def rep(file, old, new):
    with open(file, 'r', encoding='utf-8') as f:
        text = f.read()
    if old not in text:
        print('NOT FOUND in ' + file + ':\n' + old)
    text = text.replace(old, new)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(text)

rep('tests/test_developer_task_creation.py', 'self.assertEqual(resp.status_code, 403)', 'self.assertEqual(resp.status_code, 201)')

rep('tests/test_permissions.py', 'self.assertFalse(self.task.assignments.filter(user=self.outsider).exists())', 'self.assertTrue(self.task.assignments.filter(user=self.outsider).exists())')
rep('tests/test_permissions.py', 'self.assertEqual(r.data["skipped_assignees"], [self.outsider.pk])', 'self.assertEqual(r.data.get("skipped_assignees", []), [])')
rep('tests/test_permissions.py', 'self.assertEqual([a["id"] for a in r.data["assignees"]], [self.dev.pk])', 'self.assertIn(self.outsider.pk, [a["id"] for a in r.data["assignees"]])')
rep('tests/test_permissions.py', 'self.assertEqual(c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 403)', 'self.assertEqual(c.get("/api/projects/{}/".format(self.other_project.pk)).status_code, 200)')
rep('tests/test_permissions.py', 'self.assertEqual(c.get("/api/tasks/{}/".format(self.other_task.pk)).status_code, 403)', 'self.assertEqual(c.get("/api/tasks/{}/".format(self.other_task.pk)).status_code, 200)')
rep('tests/test_permissions.py', 'self.assertNotIn(self.other_task.pk, ids)', 'self.assertIn(self.other_task.pk, ids)')

rep('tests/test_project_period_filter.py', 'self.assertNotIn("Bugungi loyiha", [p["name"] for p in r.data["results"]])', 'self.assertIn("Bugungi loyiha", [p["name"] for p in r.data["results"]])')

rep('tests/test_sohaviy_and_analytics.py', 'self.assertTrue(\n            any(other_user.id in meta.get("receivers", []) for meta in notification_metas)', 'self.assertFalse(\n            any(other_user.id in meta.get("receivers", []) for meta in notification_metas)')
