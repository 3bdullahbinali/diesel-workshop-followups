#!/usr/bin/env python3
"""يدمج index.html مع أنماطه وبياناته في ملف واحد للمعاينة.

النسخة المدموجة للعرض والمراجعة فقط. المصدر المعتمد يبقى الملفات المنفصلة.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "preview.html"


def inline(html, pattern, path, wrap):
    body = (ROOT / path).read_text(encoding="utf-8")
    return html.replace(pattern, wrap.format(body=body), 1)


CONFIGS = [("sheets-config", "STATIONS_SHEET_CONFIG"), ("api-config", "STATIONS_API_CONFIG")]


def sync_config():
    """يولّد ملفات الإعداد بصيغة js من نظيرتها json حتى لا تتفرّع."""
    import json
    for name, global_name in CONFIGS:
        source = ROOT / f"{name}.json"
        if not source.exists():
            continue
        data = json.loads(source.read_text(encoding="utf-8"))
        (ROOT / f"{name}.js").write_text(
            f"// مولَّد من {name}.json — لا يُحرَّر مباشرة.\nwindow.{global_name} = "
            + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")


def build():
    sync_config()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = inline(html, '<link rel="stylesheet" href="./stations.css">',
                  "stations.css", "<style>\n{body}\n</style>")
    html = inline(html, '<link rel="stylesheet" href="./present.css">',
                  "present.css", "<style>\n{body}\n</style>")
    for name in ("data.js", "sheets-config.js", "api-config.js", "model.js",
                 "api.js", "store.js", "present.js", "app.js", "editor.js", "sheets.js", "sync.js"):
        html = inline(html, f'<script src="./{name}"></script>', name,
                      "<script>\n{body}\n</script>")

    # لافتة تظهر في المعاينة وحدها حتى لا تُقرأ كنسخة معتمدة.
    html = html.replace("</main>", """  <p style="margin:22px 0 0;padding:13px 18px;background:#eef2f0;border-radius:9px;
    color:#63736d;font-size:.8125rem;line-height:1.7">ملف معاينة مدموج، مولَّد من
    <code>stations/index.html</code> وملفاته. المصدر المعتمد هو الملفات المنفصلة،
    وإعادة البناء عبر <code>stations/tools/build-preview.py</code>.</p>
</main>""", 1)

    OUT.write_text(html, encoding="utf-8")
    remaining = re.findall(r'(?:src|href)="\./[^"]+"', html)
    print(f"{OUT.relative_to(ROOT.parent)} — {len(html) / 1024:.0f} كيلوبايت")
    print("مراجع خارجية متبقية:", remaining or "لا شيء")


if __name__ == "__main__":
    build()
