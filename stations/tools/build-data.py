#!/usr/bin/env python3
"""يبني stations/data.json من ملفات CSV المصدر المحفوظة في stations/data/source.

قاعدة البناء: لا يُخترع أي معطى. كل حقل مشتق يحمل علامة اشتقاقه، والنص الأصلي
للحالة يُحفظ حرفياً في stateDetail حتى لا تضيع صياغة المصدر.
"""
import csv
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source"
OUT = ROOT / "data.json"

BUILD_DATE = "2026-09-19"
LATEST_DAILY = "2026-09-17"

# ---------------------------------------------------------------- الحالات
# قائمة مغلقة تحل محل 20 صيغة نصية حرة في المصدر. النص الأصلي يبقى في stateDetail.
STATES = [
    ("in_progress", "قيد التنفيذ", "عمل جارٍ حسب آخر سجل يومي."),
    ("awaiting_evidence", "بانتظار دليل", "الإجراء على الفريق: تأكيد نتيجة أو مطابقة أو توثيق اختبار."),
    ("awaiting_reply", "بانتظار رد جهة", "الإجراء على جهة أخرى: مورد أو مشاريع أو عقود ومشتريات."),
    ("stale", "بحاجة تحديث", "سياق تاريخي لم يُحدَّث؛ لا يمثل الجاهزية الحالية."),
    ("needs_data", "بيانات ناقصة", "لا يمكن تصنيف المتابعة قبل استكمال بياناتها الأساسية."),
    ("closed", "مغلقة", "أُغلقت بتاريخ ودليل إغلاق."),
]

# تعيين صريح من نص المصدر الحرفي إلى الحالة. أي نص غير مدرج يوقف البناء.
STATE_MAP = {
    "قيد التنفيذ": "in_progress",
    "قيد التنفيذ حسب آخر سجل": "in_progress",
    "تحتاج تحديثاً": "stale",
    "بانتظار تحديث": "stale",
    "بحاجة استكمال البيانات": "needs_data",
    "بانتظار تقييم فني": "awaiting_evidence",
    "بانتظار إثبات الجاهزية": "awaiting_evidence",
    "بانتظار مستندات فنية": "awaiting_reply",
    "بانتظار استكمال التقارير": "awaiting_evidence",
    "قيد التقييم الفني": "awaiting_reply",
    "التقييم / توثيق الاعتماد": "awaiting_evidence",
    "بانتظار LPO — آخر حالة سابقة": "awaiting_reply",
    "بانتظار أكواد الأصناف": "awaiting_evidence",
    "بانتظار تأكيد التشغيل": "awaiting_evidence",
    "بانتظار تأكيد اكتمال الكمية": "awaiting_evidence",
    "بانتظار مطابقة الكمية والاختبار": "awaiting_evidence",
    "أنشطة تركيب منجزة؛ الاختبار غير موثق": "awaiting_evidence",
    "بانتظار مطابقة نطاق الإنجاز": "awaiting_evidence",
    "بانتظار مطابقة الأصل": "awaiting_evidence",
    "بانتظار تأكيد نتائج جميع المضخات": "awaiting_evidence",
}

# الحالات التي تصف آخر سجل يومي فقط، لا وضعاً مؤكداً اليوم.
LAST_RECORD_ONLY = {"قيد التنفيذ حسب آخر سجل"}

# ------------------------------------------------------- الجهة المنتظر ردها
PARTIES = [
    ("internal", "الفريق", "الإجراء التالي على فريق المحطات نفسه."),
    ("projects", "إدارة المشاريع", ""),
    ("supplier", "المورد", ""),
    ("cpd", "العقود والمشتريات / تراسل", ""),
    ("ica", "ICA", ""),
    ("electrical", "قسم الكهرباء", ""),
    ("warehouse", "المستودع", ""),
    ("admin", "المتابعة الإدارية", ""),
    ("unknown", "غير محددة", "لم يرد في المصدر ما يحدد الجهة."),
]

# مشتق من نص «الإجراء التالي» في المصدر، ويحتاج تأكيد الفريق قبل الاعتماد.
WAITING_ON = {
    "GEN-001": "internal", "GEN-002": "internal", "GEN-003": "internal",
    "GEN-004": "ica", "GEN-005": "ica", "GEN-006": "internal",
    "GEN-007": "supplier", "GEN-008": "projects", "GEN-009": "electrical",
    "GEN-010": "projects", "GEN-011": "projects", "GEN-012": "admin",
    "PR-10013390": "supplier", "PR-10013467": "cpd", "PR-10013556": "cpd",
    "PR-OIL": "warehouse", "PR-GREASE": "warehouse", "PR-10011672": "cpd",
    "SUP-001": "internal",
}

KINDS = [
    ("work", "الأعمال والصيانة"),
    ("general", "المتابعات العامة والمشاريع"),
    ("pr", "طلبات الشراء"),
    ("support", "مساندة أقسام أخرى"),
]

PROCUREMENT_STAGES = [
    ("preparation", "قيد الإعداد"),
    ("evaluation", "تحت التقييم"),
    ("lpo", "بانتظار LPO"),
    ("delivery", "بانتظار التوريد"),
    ("partial", "استلام جزئي"),
    ("review", "مراجعة حالة سابقة"),
    ("closure", "بانتظار الإغلاق"),
]

ORDER_RE = re.compile(r"\b(5[24]\d{8})\b")


def read(name):
    with open(SRC / name, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def split_ids(value):
    return [p.strip() for p in (value or "").split(";") if p.strip()]


def norm(text):
    """تطبيع عربي خفيف للبحث: توحيد الألف والهاء وإسقاط التشكيل."""
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[إأآا]", "ا", text).replace("ة", "ه").lower().strip()


def orders_in(*fields):
    found = []
    for field in fields:
        for hit in ORDER_RE.findall(str(field or "")):
            if hit not in found:
                found.append(hit)
    return found


def build():
    problems = []

    # ------------------------------------------------ المحطات والمواقع
    stations, locations = [], []
    for row in read("station_references.csv"):
        entry = {
            "id": row["Reference_ID"],
            "name": row["Name"],
            "readiness": row["Readiness"],
            "readinessConfirmed": False,
        }
        # الفصل مأخوذ من العمود Location_Only في المصدر، لا من اجتهاد على الاسم.
        (locations if row["Location_Only"] == "True" else stations).append(entry)

    known_places = {s["id"] for s in stations} | {l["id"] for l in locations}

    # ------------------------------------------------------ الأنشطة اليومية
    daily = []
    for row in read("daily_activities.csv"):
        order = row["Work_Order_Validated"].strip()
        raw = row["Work_Order_Raw"].strip()
        daily.append({
            "id": row["Activity_ID"],
            "date": row["File_Date"],
            "dateVerified": row["Date_Verified"] == "True",
            "station": row["Station"],
            "description": row["Description_As_Recorded"],
            "order": order or None,
            # القيمة الخام تُحفظ حين لا تصلح رقماً؛ لا تُصحَّح ولا تُهمل.
            "orderRaw": raw if raw and raw != order else None,
            "finalStatus": row["Recorded_Final_Status"],
            "staff": [s.strip() for s in row["Team_Names"].split(";") if s.strip()],
            "sourceId": row["Source_ID"],
            "sourceRows": row["Source_Rows"],
            "findings": [f.strip() for f in row["Source_Findings"].split(";") if f.strip()],
        })
        if row["Station"] not in known_places:
            problems.append(f"نشاط {row['Activity_ID']} يشير إلى موقع غير معرّف: {row['Station']}")

    daily_by_id = {a["id"]: a for a in daily}

    # ------------------------------------------------------------ المتابعات
    followups = []
    for row in read("followups.csv"):
        fid = row["ID"]
        recorded = row["Recorded_Status"].strip()
        if recorded not in STATE_MAP:
            problems.append(f"المتابعة {fid}: حالة غير معرّفة في الجدول «{recorded}»")
            state = "needs_data"
        else:
            state = STATE_MAP[recorded]

        related = split_ids(row["Related_Daily_IDs"])
        for rid in related:
            if rid not in daily_by_id:
                problems.append(f"المتابعة {fid} ترتبط بنشاط غير موجود: {rid}")

        kind = row["Type"]
        if fid.startswith("SUP-"):
            kind = "support"

        orders = orders_in(row["Reference"], *[daily_by_id[r]["order"] for r in related if r in daily_by_id])

        followups.append({
            "id": fid,
            "kind": kind,
            "title": row["Subject"],
            "stationId": row["Station"],
            "reference": row["Reference"],
            "orders": orders,
            # الحالة المصنفة + النص الأصلي كما ورد، دون استبدال.
            "state": state,
            "stateDetail": recorded,
            "stateFromLastRecordOnly": recorded in LAST_RECORD_ONLY,
            "waitingOn": WAITING_ON.get(fid, "internal" if kind in ("work", "support") else "unknown"),
            "waitingOnDerived": True,
            "evidenceDate": row["Evidence_Date"] or None,
            "ownerPerSource": row["Owner_Per_Source"],
            "nextAction": row["Next_Action"],
            "needsReview": row["Needs_Review"] == "True",
            "dueDate": row["Due_Date"] or None,
            "closed": row["Closed"] == "True",
            "closeDate": None,
            "closeProof": None,
            "prStage": row["PR_Stage"] or None,
            "sourceIds": split_ids(row["Sources"]),
            "notes": row["Notes"],
            "relatedDaily": related,
            "history": [],
        })
        if row["Station"] not in known_places:
            problems.append(f"المتابعة {fid} تشير إلى موقع غير معرّف: {row['Station']}")

    # ------------------------------------------- الأنشطة غير المرتبطة بمتابعة
    linked = {rid for f in followups for rid in f["relatedDaily"]}
    orphans = []
    for activity in daily:
        if activity["id"] in linked:
            continue
        text = norm(activity["description"])
        # صيانة وقائية منجزة بلا ملاحظات: لا تستدعي متابعة مفتوحة بالضرورة.
        routine = text.startswith("pm work") and activity["finalStatus"] == "Completed" and not activity["findings"]
        orphans.append({
            "activityId": activity["id"],
            "category": "routine_pm" if routine else "unlinked_work",
            "reason": "صيانة وقائية منجزة دون ملاحظات" if routine
                      else "عمل مسجل دون متابعة تغطيه؛ يُعرض للفريق لإنشاء متابعة أو استبعاده",
        })

    # رقم الأمر يطابق متابعة في محطة أخرى: يُعرض كإشارة تحقق، ولا يُربط تلقائياً.
    cross_refs = []
    for orphan in orphans:
        activity = daily_by_id[orphan["activityId"]]
        if not activity["order"]:
            continue
        elsewhere = [f["id"] for f in followups
                     if activity["order"] in f["orders"] and f["stationId"] != activity["station"]]
        if elsewhere:
            cross_refs.append({
                "activityId": activity["id"],
                "order": activity["order"],
                "activityStation": activity["station"],
                "followupIds": elsewhere,
                "note": "رقم الأمر نفسه مستخدم في موقع آخر؛ يلزم التحقق قبل أي ربط.",
            })

    # ------------------------------------------------ فهرس أوامر العمل
    order_index = defaultdict(lambda: {"stations": set(), "activityIds": [], "followupIds": []})
    for activity in daily:
        if activity["order"]:
            entry = order_index[activity["order"]]
            entry["stations"].add(activity["station"])
            entry["activityIds"].append(activity["id"])
    for followup in followups:
        for order in followup["orders"]:
            entry = order_index[order]
            entry["stations"].add(followup["stationId"])
            entry["followupIds"].append(followup["id"])

    work_orders = []
    for number in sorted(order_index):
        entry = order_index[number]
        places = sorted(entry["stations"])
        work_orders.append({
            "number": number,
            "stations": places,
            # رقم واحد عبر مواقع متعددة: قد يكون أمراً جامعاً وقد يكون خطأ إدخال.
            "multiStation": len(places) > 1,
            "activityIds": entry["activityIds"],
            "followupIds": sorted(set(entry["followupIds"])),
        })

    # ------------------------------------------------------------ الكتب
    letters = []
    for row in read("tarasel_letters.csv"):
        letters.append({
            "id": row["Letter_ID"],
            "number": row["Number"],
            "direction": row["Direction"],
            "date": row["Date"],
            "subject": row["Subject"],
            "party": row["Party"],
            "action": row["Action"],
            "linkedId": row["Parent_ID"] or None,
            "closed": row["Closed"] == "True",
            "closeDate": None,
            "closeProof": None,
            "sourceIds": split_ids(row["Sources"]),
            "notes": row["Notes"],
        })

    sources = [{
        "id": row["Source_ID"],
        "name": row["Title"],
        "date": row["Source_Date"],
        "note": row["Notes"],
    } for row in read("sources.csv")]

    issues = [{
        "id": row["Finding_ID"],
        "severity": row["Priority"],
        "title": row["Subject"],
        "description": row["Finding"],
        "action": row["Required_Action"],
        "sourceIds": split_ids(row["Sources"]),
        "resolved": False,
    } for row in read("review_findings.csv")]

    data = {
        "schemaVersion": 2,
        "meta": {
            "name": "فريق صيانة المحطات الخارجية",
            "subtitle": "بلدية مدينة الشارقة · إدارة الصرف الصحي",
            "buildDate": BUILD_DATE,
            "latestDailyDate": LATEST_DAILY,
            "mode": "local-review",
            "note": "نسخة مراجعة. الحالات المصنفة مشتقة من نص المصدر، وحقل الجهة المنتظر ردها مشتق ويحتاج تأكيد الفريق.",
            "coverage": {
                "followups": len(followups),
                "needsReview": sum(1 for f in followups if f["needsReview"]),
                "activities": len(daily),
                "activitiesLinked": len(daily) - len(orphans),
                "activitiesUnlinked": len(orphans),
                "multiStationOrders": sum(1 for w in work_orders if w["multiStation"]),
            },
        },
        "enums": {
            "states": [{"id": i, "label": l, "note": n} for i, l, n in STATES],
            "parties": [{"id": i, "label": l, "note": n} for i, l, n in PARTIES],
            "kinds": [{"id": i, "label": l} for i, l in KINDS],
            "procurementStages": [{"id": i, "label": l} for i, l in PROCUREMENT_STAGES],
        },
        "followups": followups,
        "daily": daily,
        "workOrders": work_orders,
        "letters": letters,
        "sources": sources,
        "issues": issues,
        "stations": stations,
        "locations": locations,
        "orphanActivities": orphans,
        "crossStationOrderRefs": cross_refs,
        "buildProblems": problems,
    }

    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"متابعات: {len(followups)} | أنشطة: {len(daily)} | أوامر عمل: {len(work_orders)}")
    print(f"محطات: {len(stations)} | مواقع وجهات أخرى: {len(locations)}")
    routine = sum(1 for o in orphans if o["category"] == "routine_pm")
    print(f"أنشطة مرتبطة بمتابعة: {len(daily) - len(orphans)}/{len(daily)}"
          f" | بلا متابعة: {len(orphans)} (منها {routine} صيانة وقائية منجزة"
          f"، و{len(orphans) - routine} عمل يحتاج قراراً)")
    print(f"إشارات رقم أمر عبر موقع مختلف: {len(cross_refs)}")
    print(f"أوامر عمل عبر أكثر من موقع: {sum(1 for w in work_orders if w['multiStation'])}")
    for state_id, label, _ in STATES:
        count = sum(1 for f in followups if f["state"] == state_id)
        if count:
            print(f"  {label}: {count}")
    if problems:
        print("\nمشاكل بناء:")
        for problem in problems:
            print(" -", problem)


if __name__ == "__main__":
    build()
