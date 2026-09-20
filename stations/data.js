// هيكل فارغ — لا سجل في الموقع. البيانات تُقرأ من الشيت بعد تسجيل الدخول.
window.STATIONS_DATA = {
 "schemaVersion": 2,
 "meta": {
  "name": "فريق صيانة المحطات الخارجية",
  "subtitle": "بلدية مدينة الشارقة · إدارة الصرف الصحي",
  "buildDate": "2026-09-19",
  "latestDailyDate": "",
  "mode": "locked",
  "note": "هيكل فارغ. السجل لا يُحمَّل إلا بعد تسجيل الدخول، ولا نسخة منه في الموقع.",
  "coverage": {
   "followups": 0,
   "needsReview": 0,
   "activities": 0,
   "activitiesLinked": 0,
   "activitiesUnlinked": 0,
   "multiStationOrders": 0
  }
 },
 "enums": {
  "states": [
   {
    "id": "in_progress",
    "label": "قيد التنفيذ",
    "note": "عمل جارٍ حسب آخر سجل يومي."
   },
   {
    "id": "awaiting_evidence",
    "label": "بانتظار دليل",
    "note": "الإجراء على الفريق: تأكيد نتيجة أو مطابقة أو توثيق اختبار."
   },
   {
    "id": "awaiting_reply",
    "label": "بانتظار رد جهة",
    "note": "الإجراء على جهة أخرى: مورد أو مشاريع أو عقود ومشتريات."
   },
   {
    "id": "stale",
    "label": "بحاجة تحديث",
    "note": "سياق تاريخي لم يُحدَّث؛ لا يمثل الجاهزية الحالية."
   },
   {
    "id": "needs_data",
    "label": "بيانات ناقصة",
    "note": "لا يمكن تصنيف المتابعة قبل استكمال بياناتها الأساسية."
   },
   {
    "id": "closed",
    "label": "مغلقة",
    "note": "أُغلقت بتاريخ ودليل إغلاق."
   }
  ],
  "parties": [
   {
    "id": "internal",
    "label": "الفريق",
    "note": "الإجراء التالي على فريق المحطات نفسه."
   },
   {
    "id": "projects",
    "label": "إدارة المشاريع",
    "note": ""
   },
   {
    "id": "supplier",
    "label": "المورد",
    "note": ""
   },
   {
    "id": "cpd",
    "label": "العقود والمشتريات / تراسل",
    "note": ""
   },
   {
    "id": "ica",
    "label": "ICA",
    "note": ""
   },
   {
    "id": "electrical",
    "label": "قسم الكهرباء",
    "note": ""
   },
   {
    "id": "warehouse",
    "label": "المستودع",
    "note": ""
   },
   {
    "id": "admin",
    "label": "المتابعة الإدارية",
    "note": ""
   },
   {
    "id": "unknown",
    "label": "غير محددة",
    "note": "لم يرد في المصدر ما يحدد الجهة."
   }
  ],
  "kinds": [
   {
    "id": "work",
    "label": "الأعمال والصيانة"
   },
   {
    "id": "general",
    "label": "المتابعات العامة والمشاريع"
   },
   {
    "id": "pr",
    "label": "طلبات الشراء"
   },
   {
    "id": "support",
    "label": "مساندة أقسام أخرى"
   }
  ],
  "procurementStages": [
   {
    "id": "preparation",
    "label": "قيد الإعداد"
   },
   {
    "id": "evaluation",
    "label": "تحت التقييم"
   },
   {
    "id": "lpo",
    "label": "بانتظار LPO"
   },
   {
    "id": "delivery",
    "label": "بانتظار التوريد"
   },
   {
    "id": "partial",
    "label": "استلام جزئي"
   },
   {
    "id": "review",
    "label": "مراجعة حالة سابقة"
   },
   {
    "id": "closure",
    "label": "بانتظار الإغلاق"
   }
  ]
 },
 "followups": [],
 "daily": [],
 "workOrders": [],
 "letters": [],
 "sources": [],
 "issues": [],
 "stations": [],
 "locations": [],
 "orphanActivities": [],
 "crossStationOrderRefs": [],
 "buildProblems": []
};
