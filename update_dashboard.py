with open('frontend/src/pages/Dashboard.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

old_card = 'background: "#fff",\n                borderRadius: 14,\n                border: isSelected ? "2px solid #0f172a" : "1px solid #e2e8f0",'
new_card = 'background: isSelected ? theme.activeBg : "#fff",\n                borderRadius: 14,\n                border: isSelected ? 2px solid  : "1px solid #e2e8f0",'
text = text.replace(old_card, new_card)

old_alert = 'background: "#f8fafc",\n            border: "1px solid #e2e8f0",'
new_alert = 'background: "#fffbeb",\n            border: "1px solid #fcd34d",'
text = text.replace(old_alert, new_alert)

text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                        ? "#18181b"\n                        : "#ffffff"',
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                        ? theme.iconColor\n                        : "#ffffff"'
)
text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                        ? "1px solid #18181b"\n                        : "1px solid #e4e4e7"',
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                        ? 1px solid \n                        : "1px solid #e4e4e7"'
)

text = text.replace(
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                        ? "#18181b"\n                        : "#ffffff"',
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                        ? theme.iconColor\n                        : "#ffffff"'
)
text = text.replace(
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                        ? "1px solid #18181b"\n                        : "1px solid #e4e4e7"',
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                        ? 1px solid \n                        : "1px solid #e4e4e7"'
)

text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "completed"\n                        ? "#18181b"\n                        : "#ffffff"',
    'selectedPeriod === p.key && selectedMetric === "completed"\n                        ? theme.iconColor\n                        : "#ffffff"'
)
text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "completed"\n                        ? "1px solid #18181b"\n                        : "1px solid #e4e4e7"',
    'selectedPeriod === p.key && selectedMetric === "completed"\n                        ? 1px solid \n                        : "1px solid #e4e4e7"'
)

# Text colors for selected tabs
text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                          ? "#a1a1aa"\n                          : "#71717a"',
    'selectedPeriod === p.key && selectedMetric === "submitted"\n                          ? "#ffffff"\n                          : "#71717a"'
)
text = text.replace(
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                          ? "#a1a1aa"\n                          : "#71717a"',
    'selectedPeriod === p.key && (selectedMetric === "in_progress" || selectedMetric === "approved")\n                          ? "#ffffff"\n                          : "#71717a"'
)
text = text.replace(
    'selectedPeriod === p.key && selectedMetric === "completed"\n                          ? "#a1a1aa"\n                          : "#71717a"',
    'selectedPeriod === p.key && selectedMetric === "completed"\n                          ? "#ffffff"\n                          : "#71717a"'
)


with open("frontend/src/pages/Dashboard.tsx", "w", encoding="utf-8") as f:
    f.write(text)
