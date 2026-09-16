'use strict';
window.WorkshopRecordTime = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return window.WorkshopI18n.t('غير مسجل');
  return new Intl.DateTimeFormat(window.WorkshopI18n.locale, {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit',
    hourCycle:'h23', timeZone:'Asia/Dubai'
  }).format(new Date(value));
};
