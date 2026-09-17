import re

text_lines = r"""1: import { useEffect, useId, useMemo, useRef, useState } from "react";
2: import { ApiError, api, listOf } from "@/api/client";
3: import { addOrderAttachments, deleteOrderAttachment } from "@/api/orders";
4: import type { ChangeRequestItem, OrderAttachmentItem, OrderTypeValue, Project } from "@/api/types";
5: import { useFetch } from "@/api/useFetch";
6: import { useAuth } from "@/auth/AuthContext";
7: import { PageHead } from "@/components/Layout";
8: import { Card, ErrorMsg, Loading, fmtDateTime } from "@/components/ui";
9: import { tx } from "@/i18n";
10: import { toOrders, useEntityId, useGo, useIsPath } from "@/nav";
11: 
12: const ORDER_DRAFT_KEY = "teamflow_draft_new_order";
13: 
14: export default function OrderForm() {
15:   const fid = useId();
16:   const formId = `${fid}-form`;
17:   const isOrderPath1 = useIsPath("/buyurtma/yangi");
18:   const isOrderPath2 = useIsPath("/buyurtmalar/yangi");
19:   const creating = isOrderPath1 || isOrderPath2;
20:   const stored = useEntityId("order");
21:   const id = creating ? null : stored;
22:   const go = useGo();
23:   const { user, meta } = useAuth();
24:   const editing = Boolean(id);
25: 
26:   const isPM = Boolean(
27:     (user?.is_manager || user?.global_role === "MANAGER" || user?.specialty === "PM") &&
28:     !user?.is_sohaviy_boshqarma &&
29:     !user?.is_platform_admin &&
30:     !user?.is_boss
31:   );
32: 
33:   const [existingItem, setExistingItem] = useState<ChangeRequestItem | null>(null);
34:   const [existingAttachments, setExistingAttachments] = useState<OrderAttachmentItem[]>([]);
35:   const [files, setFiles] = useState<File[]>([]);
36:   const [loaded, setLoaded] = useState(!editing);
37:   const [error, setError] = useState<string | null>(null);
38:   const [errors, setErrors] = useState<Record<string, string>>({});
39:   const [busy, setBusy] = useState(false);
40: 
41:   // Real-time joriy vaqt (aniq sana va soat)
42:   const [now, setNow] = useState(() => new Date());
43:   useEffect(() => {
44:     const timer = setInterval(() => setNow(new Date()), 1000);
45:     return () => clearInterval(timer);
46:   }, []);
47: 
48:   const { data: projectsData } = useFetch<{ count: number; results: Project[] } | Project[]>(
49:     "/projects/",
50:     { scope: "visible" }
51:   );
52:   const projects: Project[] = useMemo(() => (projectsData ? listOf<Project>(projectsData) : []), [projectsData]);
53: 
54:   const userDepartment = useMemo(() => {
55:     if (!user) return "";
56:     if (user.department_name && user.department_name.trim()) return user.department_name.trim();
57:     if (user.department && typeof user.department === "string" && user.department.trim()) return user.department.trim();
58:     return "";
59:   }, [user]);
60: 
61:   const [f, setF] = useState<{
62:     system_name: string;
63:     order_type: OrderTypeValue;
64:     module: string;
65:     department: string;
66:     responsible_person: string;
67:     priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
68:     due_date: string;
69:     project: number | null;
70:     current_state: string;
71:     requested_change: string;
72:     reason: string;
73:     affected_modules: string;
74:     dependent_systems: string;
75:     change_nature: "USER_FACING" | "BACKEND" | "BOTH";
76:     additional_materials: string;
77:     tz_file_url?: string;
78:     tz_file_name?: string;
79:   }>({
80:     system_name: "",
81:     order_type: "NEW",
82:     module: "",
83:     department: userDepartment,
84:     responsible_person: user?.full_name || "",
85:     priority: "HIGH",
86:     due_date: "",
87:     project: null,
88:     current_state: "",
89:     requested_change: "",
90:     reason: "",
91:     affected_modules: "",
92:     dependent_systems: "",
93:     change_nature: "BOTH",
94:     additional_materials: "",
95:   });
96: 
97:   // Foydalanuvchi profili yuklanganda profilidagi bo'linma va ism avtomatik o'rnatiladi
98:   useEffect(() => {
99:     if (!editing && userDepartment) {
100:       setF((prev) => {
101:         if (!prev.department) {
102:           return { ...prev, department: userDepartment };
103:         }
104:         return prev;
105:       });
106:     }
107:   }, [userDepartment, editing]);
108: 
109:   useEffect(() => {
110:     if (!editing && user?.full_name) {
111:       setF((prev) => {
112:         if (!prev.responsible_person) {
113:           return { ...prev, responsible_person: user.full_name };
114:         }
115:         return prev;
116:       });
117:     }
118:   }, [user?.full_name, editing]);
119: 
120:   const [draftRestored, setDraftRestored] = useState(false);
121:   const [serverDraftId, setServerDraftId] = useState<number | null>(null);
122:   const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
123:   const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
124:   const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
125:   const isMountedRef = useRef(true);
126: 
127:   useEffect(() => {
128:     isMountedRef.current = true;
129:     return () => {
130:       isMountedRef.current = false;
131:     };
132:   }, []);
133: 
134:   // Qoralamani yuklash (agar foydalanuvchi oldin kiritib chiqib ketgan bo'lsa)
135:   useEffect(() => {
136:     if (editing) return;
137:     try {
138:       const raw = localStorage.getItem(ORDER_DRAFT_KEY);
139:       if (raw) {
140:         const parsed = JSON.parse(raw);
141:         if (
142:           parsed?.f &&
143:           (parsed.f.system_name?.trim() ||
144:             parsed.f.module?.trim() ||
145:             parsed.f.due_date ||
146:             parsed.f.project ||
147:             parsed.f.requested_change?.trim() ||
148:             parsed.f.current_state?.trim() ||
149:             parsed.f.reason?.trim() ||
150:             (parsed.f.order_type && parsed.f.order_type !== "NEW"))
151:         ) {
152:           setF((prev) => ({
153:             ...prev,
154:             ...parsed.f,
155:             department: userDepartment || parsed.f.department || prev.department,
156:             responsible_person: user?.full_name || parsed.f.responsible_person || prev.responsible_person,
157:           }));
158:           if (parsed.serverDraftId) {
159:             setServerDraftId(parsed.serverDraftId);
160:           }
161:           if (parsed.lastSavedTime) {
162:             setLastSavedTime(parsed.lastSavedTime);
163:             setAutoSaveStatus("saved");
164:           }
165:           setDraftRestored(true);
166:         }
167:       }
168:     } catch {
169:       // ignore
170:     }
171:   }, [editing, userDepartment, user?.full_name]);
172: 
173:   // Web-saytda (brauzerda) ma'lumotlarni avtomatik saqlash (har bir o'zgarishda)
174:   useEffect(() => {
175:     if (editing) return;
176:     const isDirty = Boolean(
177:       f.system_name?.trim() ||
178:         f.module?.trim() ||
179:         f.due_date ||
180:         f.project ||
181:         f.requested_change?.trim() ||
182:         f.current_state?.trim() ||
183:         f.reason?.trim() ||
184:         f.order_type !== "NEW" ||
185:         (userDepartment && f.department && f.department !== userDepartment) ||
186:         (user?.full_name && f.responsible_person && f.responsible_person !== user.full_name)
187:     );
188:     if (isDirty) {
189:       try {
190:         const nowTime = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
191:         localStorage.setItem(
192:           ORDER_DRAFT_KEY,
193:           JSON.stringify({ f, serverDraftId, lastSavedTime: nowTime })
194:         );
195:       } catch {
196:         // ignore
197:       }
198:     }
199:   }, [editing, f, serverDraftId, userDepartment, user?.full_name]);
200: 
201:   // Serverga avtomatik saqlash (fondan bazada DRAFT holatida saqlanadi)
202:   useEffect(() => {
203:     if (editing || isPM) return;
204:     const hasData = Boolean(
205:       f.system_name?.trim() ||
206:         f.module?.trim() ||
207:         f.due_date ||
208:         f.project ||
209:         f.requested_change?.trim() ||
210:         f.current_state?.trim() ||
211:         f.reason?.trim() ||
212:         files.length > 0
213:     );
214:     if (!hasData) return;
215: 
216:     if (autoSaveTimerRef.current) {
217:       clearTimeout(autoSaveTimerRef.current);
218:     }
219: 
220:     autoSaveTimerRef.current = setTimeout(async () => {
221:       try {
222:         if (!isMountedRef.current) return;
223:         setAutoSaveStatus("saving");
224:         const payload: Record<string, unknown> = {};
225:         Object.entries(f).forEach(([key, val]) => {
226:           if (val === null || val === undefined) return;
227:           payload[key] = val;
228:         });
229:         payload.status = "DRAFT";
230: 
231:         let draftId = serverDraftId;
232:         if (draftId) {
233:           await api.patch(`/orders/${draftId}/`, payload);
234:         } else {
235:           const res = await api.post<ChangeRequestItem>("/orders/", payload);
236:           if (res?.id && isMountedRef.current) {
237:             draftId = res.id;
238:             setServerDraftId(res.id);
239:           }
240:         }
241:         if (isMountedRef.current) {
242:           const nowTime = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
243:           try {
244:             localStorage.setItem(
245:               ORDER_DRAFT_KEY,
246:               JSON.stringify({ f, serverDraftId: draftId, lastSavedTime: nowTime })
247:             );
248:           } catch {
249:             // ignore
250:           }
251:           setAutoSaveStatus("saved");
252:           setLastSavedTime(nowTime);
253:         }
254:       } catch {
255:         if (isMountedRef.current) {
256:           setAutoSaveStatus("saved");
257:         }
258:       }
259:     }, 1200);
260: 
261:     return () => {
262:       if (autoSaveTimerRef.current) {
263:         clearTimeout(autoSaveTimerRef.current);
264:       }
265:     };
266:   }, [editing, f, isPM, serverDraftId, files.length]);
267: 
268:   function clearDraft() {
269:     localStorage.removeItem(ORDER_DRAFT_KEY);
270:     setServerDraftId(null);
271:     setF({
272:       system_name: "",
273:       order_type: "NEW",
274:       module: "",
275:       department: userDepartment,
276:       responsible_person: user?.full_name || "",
277:       priority: "HIGH",
278:       due_date: "",
279:       project: null,
280:       current_state: "",
281:       requested_change: "",
282:       reason: "",
283:       affected_modules: "",
284:       dependent_systems: "",
285:       change_nature: "BOTH",
286:       additional_materials: "",
287:     });
288:     setFiles([]);
289:     setDraftRestored(false);
290:     setAutoSaveStatus("idle");
291:     setLastSavedTime(null);
292:   }
293: 
294:   // Yangi buyurtmada akkaunt ma'lumotlari yuklangach bo'linma va mas'ul shaxsni avtomatik to'ldirish
295:   useEffect(() => {
296:     if (!editing && user) {
297:       setF((prev) => ({
298:         ...prev,
299:         department: prev.department ? prev.department : userDepartment,
300:         responsible_person: prev.responsible_person ? prev.responsible_person : (user.full_name || ""),
301:       }));
302:     }
303:   }, [editing, user, userDepartment]);
304: 
305:   // Tahrirlash rejimida mavjud buyurtmani yuklash
306:   useEffect(() => {
307:     let alive = true;
308:     if (!editing || !id) return;
309:     void (async () => {
310:       try {
311:         const item = await api.get<ChangeRequestItem>(`/orders/${id}/`);
312:         if (!alive) return;
313:         setExistingItem(item);
314:         setExistingAttachments(item.attachments || []);
315:         setF({
316:           system_name: item.system_name || "",
317:           order_type: item.order_type || "NEW",
318:           module: item.module || "",
319:           department: item.department || "",
320:           responsible_person: item.responsible_person || "",
321:           priority: item.priority || "HIGH",
322:           due_date: item.due_date ? item.due_date.split("T")[0] : "",
323:           project: item.project || null,
324:           current_state: item.current_state || "",
325:           requested_change: item.requested_change || "",
326:           reason: item.reason || "",
327:           affected_modules: item.affected_modules || "",
328:           dependent_systems: item.dependent_systems || "",
329:           change_nature: item.change_nature || "BOTH",
330:           additional_materials: item.additional_materials || "",
331:         });
332:         setLoaded(true);
333:       } catch (e) {
334:         if (alive) {
335:           setError(e instanceof ApiError ? e.message : tx("orders.buyurtmani_yuklab_bolmadi"));
336:           setLoaded(true);
337:         }
338:       }
339:     })();
340:     return () => {
341:       alive = false;
342:     };
343:   }, [editing, id]);
344: 
345:   const set = (k: string, v: unknown) => {
346:     setF((p) => ({ ...p, [k]: v }));
347:   };
348: 
349:   function handleCancelOrExit() {
350:     go(toOrders());
351:   }
352: 
353:   async function submit(e: React.FormEvent) {
354:     e.preventDefault();
355:     if (f.due_date) {
356:       const today = new Date().toISOString().split("T")[0];
357:       if (f.due_date < today) {
358:         setErrors((p) => ({ ...p, due_date: tx("orders.muddat_otgan_xatolik") }));
359:         setError(tx("orders.muddat_otgan_xatolik"));
360:         return;
361:     }
362:     }
363:     setBusy(true);
364:     setError(null);
365:     setErrors({});
366: 
367:     try {
368:       const payload: Record<string, unknown> = {};
369:       Object.entries(f).forEach(([key, val]) => {
370:         if (val === null || val === undefined) return;
371:         payload[key] = val;
372:       });
373:       payload.status = "NEW";
374: 
375:       const targetId = editing && id ? id : serverDraftId;
376: 
377:       if (targetId) {
378:         await api.patch(`/orders/${targetId}/`, payload);
379:         if (files.length > 0) {
380:           const fd = new FormData();
381:           files.forEach((file) => fd.append("files", file));
382:           await addOrderAttachments(targetId, fd);
383:         }
384:       } else {
385:         if (files.length > 0) {
386:           const fd = new FormData();
387:           Object.entries(payload).forEach(([key, val]) => {
388:             if (val !== null && val !== undefined) fd.append(key, String(val));
389:           });
390:           files.forEach((file) => fd.append("files", file));
391:           await api.post("/orders/", fd);
392:         } else {
393:           await api.post("/orders/", payload);
394:         }
395:       }
396:       localStorage.removeItem(ORDER_DRAFT_KEY);
397:       go(toOrders());
398:     } catch (err: unknown) {
399:       if (err instanceof ApiError) {
400:         setErrors(err.fields);
401:         setError(err.message);
402:       } else {
403:         setError(err instanceof Error ? err.message : tx("orders.saqlashda_xatolik"));
404:       }
405:     } finally {
406:       setBusy(false);
407:     }
408:   }
409: 
410:   if (creating && isPM) {
411:     return (
412:       <div className="content">
413:         <div className="card" style={{ maxWidth: 540, margin: "40px auto", padding: 32, textAlign: "center" }}>
414:           <div style={{ fontSize: 44, marginBottom: 12 }}>🚫</div>
415:           <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tx("orders.ruxsat_berilmagan")}</h2>
416:           <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
417:             {tx("orders.pm_yaratish_taqiq_desc")}
418:           </p>
419:           <button className="btn btn-primary" onClick={() => go(toOrders())}>
420:             {tx("orders.buyurtmalarga_qaytish")}
421:           </button>
422:         </div>
423:       </div>
424:     );
425:   }
426: 
427:   if (!loaded) {
428:     return (
429:       <div className="content">
430:         <Loading />
431:       </div>
432:     );
433:   }
434: 
435:   const isLockedSubmitted = Boolean(
436:     editing &&
437:     existingItem &&
438:     existingItem.status !== "DRAFT" &&
439:     !user?.is_platform_admin &&
440:     !user?.is_boss
441:   );
442: 
443:   if (isLockedSubmitted) {
444:     return (
445:       <div className="content">
446:         <div className="card" style={{ maxWidth: 580, margin: "40px auto", padding: 32, textAlign: "center" }}>
447:           <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
448:           <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tx("orders.locked_after_send_title")}</h2>
449:           <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
450:             «{existingItem?.request_no}» {tx("orders.locked_after_send_desc")}
451:           </p>
452:           <button className="btn btn-primary" onClick={() => go(toOrders())}>
453:             {tx("orders.buyurtmalarga_qaytish")}
454:           </button>
455:         </div>
456:       </div>
457:     );
458:   }
459: 
460:   if (editing) {
461:     return (
462:       <div className="content">
463:         <div className="msg msg-error" style={{ margin: "40px auto", maxWidth: 500, textAlign: "center", padding: 24, borderRadius: 10 }}>
464:           <h3 style={{ margin: "0 0 10px 0" }}>{tx("orders.tahrirlash_taqiqlangan")}</h3>
465:           <p className="muted" style={{ margin: 0, fontSize: 14 }}>
466:             {tx("orders.tahrirlash_taqiq_desc")}
467:           </p>
468:           <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => go(toOrders())}>
469:             {tx("orders.buyurtmalarga_qaytish")}
470:           </button>
471:         </div>
472:       </div>
473:     );
474:   }
475: 
476:   return (
477:     <>
478:       <PageHead
479:         title={
480:           <div className="row middle" style={{ gap: 12, flexWrap: "wrap" }}>
481:             <strong>{editing ? tx("orders.buyurtmani_tahrirlash") : tx("orders.yangi_buyurtma_tz")}</strong>
482:             {autoSaveStatus === "saving" && (
483:               <span style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
484:                 <span>⏳</span> {tx("orders.autosave_saving")}
485:               </span>
486:             )}
487:             {autoSaveStatus === "saved" && (
488:               <span style={{ fontSize: 12, color: "#059669", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
489:                 <span>✓</span> {tx("orders.autosave_saved")} {lastSavedTime ? `(${lastSavedTime})` : ""}
490:               </span>
491:             )}
492:           </div>
493:         }
494:         actions={
495:           <div className="row" style={{ gap: 8 }}>
496:             <button className="btn btn-primary" form={formId} disabled={busy}>
497:               {busy ? tx("orders.submitting") : tx("orders.send_order")}
498:             </button>
499:             <button type="button" className="btn" onClick={handleCancelOrExit}>
500:               {tx("common.bekor_qilish")}
501:             </button>
502:           </div>
503:         }
504:       />
505: 
506:       <div className="content">
507:         <ErrorMsg error={error} />
508: 
509:         {draftRestored && (
510:           <div
511:             style={{
512:               display: "flex",
513:               alignItems: "center",
514:               justifyContent: "space-between",
515:               background: "rgba(59, 130, 246, 0.08)",
516:               border: "1px solid rgba(59, 130, 246, 0.3)",
517:               borderRadius: 8,
518:               padding: "10px 14px",
519:               marginBottom: 14,
520:               fontSize: 13,
521:               color: "var(--color-fg-default)",
522:             }}
523:           >
524:             <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
525:               <span>📝</span>
526:               <span>
527:                 <strong>{tx("orders.draft_restored_title")}</strong> {tx("orders.draft_restored_desc")}
528:               </span>
529:             </div>
530:             <button
531:               type="button"
532:               className="btn btn-sm"
533:               onClick={clearDraft}
534:               style={{ color: "var(--color-danger, #ef4444)" }}
535:             >
536:               {tx("orders.draft_clear")}
537:             </button>
538:           </div>
539:         )}
540: 
541:         <form id={formId} onSubmit={submit}>
542:           <div style={{ maxWidth: 840, margin: "0 auto" }}>
543:             <Card title={tx("orders.asosiy_malumotlar")}>
544:               <div className="field">
545:                 <label htmlFor={`${fid}-sys`}>{tx("orders.tizim_nomi_label")} *</label>
546:                 <input
547:                   id={`${fid}-sys`}
548:                   list={`${fid}-systems-list`}
549:                   value={f.system_name}
550:                   required
551:                   placeholder={tx("orders.tizim_nomi_placeholder")}
552:                   onChange={(e) => {
553:                     const val = e.target.value;
554:                     const matchedProj = projects.find((p) => p.name.toLowerCase() === val.toLowerCase());
555:                     setF((prev) => ({
556:                       ...prev,
557:                       system_name: val,
558:                       project: matchedProj ? matchedProj.id : prev.project,
559:                     }));
560:                   }}
561:                 />
562:                 <datalist id={`${fid}-systems-list`}>
563:                   {projects.map((p) => (
564:                     <option key={p.id} value={p.name}>
565:                       {p.key ? `(${p.key})` : ""}
566:                     </option>
567:                   ))}
568:                 </datalist>
569:                 {errors.system_name && <div className="err">{errors.system_name}</div>}
570:               </div>
571: 
572:               <div className="row" style={{ gap: 12 }}>
573:                 <div className="field" style={{ flex: 1 }}>
574:                   <label htmlFor={`${fid}-type`}>{tx("orders.loyiha_turi_label")} *</label>
575:                   <select
576:                     id={`${fid}-type`}
577:                     value={f.order_type}
578:                     onChange={(e) => {
579:                       const val = e.target.value as OrderTypeValue;
580:                       setF((prev) => ({
581:                         ...prev,
582:                         order_type: val,
583:                         project: val === "NEW" ? null : prev.project,
584:                       }));
585:                     }}
586:                   >
587:                     {(meta?.order_type || meta?.project_type || []).map((t) => (
588:                       <option key={String(t.value)} value={String(t.value)}>{t.label}</option>
589:                     ))}
590:                   </select>
591:                 </div>
592: 
593:                 <div className="field" style={{ flex: 1 }}>
594:                   <label htmlFor={`${fid}-priority`}>{tx("orders.muhimlik_label")} *</label>
595:                   <select
596:                     id={`${fid}-priority`}
597:                     value={f.priority}
598:                     onChange={(e) => set("priority", e.target.value)}
599:                   >
600:                     {(meta?.order_priority || []).map((p) => (
601:                       <option key={String(p.value)} value={String(p.value)}>{p.label}</option>
602:                     ))}
603:                   </select>
604:                 </div>
605:               </div>
606: 
607:               {f.order_type !== "NEW" && (
608:                 <div className="field">
609:                   <label htmlFor={`${fid}-proj`}>{tx("orders.tegishli_loyiha_label")}</label>
610:                   <select
611:                     id={`${fid}-proj`}
612:                     value={f.project || ""}
613:                     onChange={(e) => {
614:                       const pid = e.target.value ? Number(e.target.value) : null;
615:                       const proj = projects.find((p) => p.id === pid);
616:                       setF((prev) => ({
617:                         ...prev,
618:                         project: pid,
619:                         system_name: proj ? proj.name : prev.system_name,
620:                       }));
621:                     }}
622:                   >
623:                     <option value="">{tx("orders.loyiha_tanlang_placeholder")}</option>
624:                     {projects.map((p) => (
625:                       <option key={p.id} value={p.id}>
626:                         {p.name} {p.key ? `(${p.key})` : ""}
627:                       </option>
628:                     ))}
629:                   </select>
630:                 </div>
631:               )}
632: 
633:               <div className="field">
634:                 <label htmlFor={`${fid}-mod`}>{tx("orders.loyiha_izoh_label")}</label>
635:                 <input
636:                   id={`${fid}-mod`}
637:                   value={f.module}
638:                   placeholder={tx("orders.loyiha_izoh_placeholder")}
639:                   onChange={(e) => set("module", e.target.value)}
640:                 />
641:                 {errors.module && <div className="err">{errors.module}</div>}
642:               </div>
643: 
644:               <div className="row" style={{ gap: 12 }}>
645:                 <div className="field" style={{ flex: 1 }}>
646:                   <label htmlFor={`${fid}-dep`}>{tx("orders.bolinma_label")} *</label>
647:                   <input
648:                     id={`${fid}-dep`}
649:                     list={`${fid}-dept-list`}
650:                     value={f.department}
651:                     required
652:                     placeholder={tx("orders.bolinma_placeholder")}
653:                     onChange={(e) => set("department", e.target.value)}
654:                   />
655:                   <datalist id={`${fid}-dept-list`}>
656:                     {(meta?.departments || []).map((d) => (
657:                       <option key={d.id} value={d.name}>
658:                         {d.code ? `(${d.code})` : ""}
659:                       </option>
660:                     ))}
661:                   </datalist>
662:                   {errors.department && <div className="err">{errors.department}</div>}
663:                 </div>
664: 
665:                 <div className="field" style={{ flex: 1 }}>
666:                   <label htmlFor={`${fid}-resp`}>{tx("orders.masul_shaxs_label")} *</label>
667:                   <input
668:                     id={`${fid}-resp`}
669:                     value={f.responsible_person}
670:                     required
671:                     onChange={(e) => set("responsible_person", e.target.value)}
672:                   />
673:                   {errors.responsible_person && <div className="err">{errors.responsible_person}</div>}
674:                 </div>
675:               </div>
676: 
677:               <div className="field">
678:                 <label htmlFor={`${fid}-due`}>{tx("orders.kerakli_muddat_label")}</label>
679:                 <input
680:                   id={`${fid}-due`}
681:                   type="date"
682:                   min={new Date().toISOString().split("T")[0]}
683:                   value={f.due_date}
684:                   onChange={(e) => set("due_date", e.target.value)}
685:                 />
686:                 {errors.due_date && <div className="err">{errors.due_date}</div>}
687:               </div>
688:             </Card>
689: 
690:             <Card title={tx("orders.bolim1_nomi")}>
691:               <div className="field">
692:                 <label htmlFor={`${fid}-requested-change`}>
693:                   {tx("orders.talab_qilinayotgan_ozgartirish")}
694:                 </label>
695:                 <textarea
696:                   id={`${fid}-requested-change`}
697:                   rows={3}
698:                   value={f.requested_change}
699:                   placeholder={tx("orders.requested_change_placeholder")}
700:                   onChange={(e) => set("requested_change", e.target.value)}
701:                 />
702:               </div>
703: 
704:               <div className="field">
705:                 <label htmlFor={`${fid}-current-state`}>
706:                   {tx("orders.joriy_holat")}
707:                 </label>
708:                 <textarea
709:                   id={`${fid}-current-state`}
710:                   rows={2}
711:                   value={f.current_state}
712:                   placeholder={tx("orders.current_state_placeholder")}
713:                   onChange={(e) => set("current_state", e.target.value)}
714:                 />
715:               </div>
716: 
717:               <div className="field">
718:                 <label htmlFor={`${fid}-reason`}>
719:                   {tx("orders.sabab_maqsad")}
720:                 </label>
721:                 <input
722:                   id={`${fid}-reason`}
723:                   value={f.reason}
724:                   placeholder={tx("orders.reason_placeholder")}
725:                   onChange={(e) => set("reason", e.target.value)}
726:                 />
727:               </div>
728:             </Card>
729: 
730:             <Card title={tx("orders.bolim2_nomi")}>
731:               <div className="row" style={{ gap: 12 }}>
732:                 <div className="field" style={{ flex: 1 }}>
733:                   <label htmlFor={`${fid}-affected-mod`}>
734:                     {tx("orders.tasir_modullar")}
735:                   </label>
736:                   <input
737:                     id={`${fid}-affected-mod`}
738:                     value={f.affected_modules}
739:                     placeholder={tx("orders.affected_modules_placeholder")}
740:                     onChange={(e) => set("affected_modules", e.target.value)}
741:                   />
742:                 </div>
743: 
744:                 <div className="field" style={{ flex: 1 }}>
745:                   <label htmlFor={`${fid}-change-nature`}>
746:                     {tx("orders.ozgarish_xarakteri")}
747:                   </label>
748:                   <select
749:                     id={`${fid}-change-nature`}
750:                     value={f.change_nature}
751:                     onChange={(e) => set("change_nature", e.target.value as "USER_FACING" | "BACKEND" | "BOTH")}
752:                   >
753:                     {(meta?.change_nature || []).map((cn) => (
754:                       <option key={String(cn.value)} value={String(cn.value)}>{cn.label}</option>
755:                     ))}
756:                   </select>
757:                 </div>
758:               </div>
759: 
760:               <div className="field">
761:                 <label htmlFor={`${fid}-dep-systems`}>
762:                   {tx("orders.bogliq_tizimlar")}
763:                 </label>
764:                 <input
765:                   id={`${fid}-dep-systems`}
766:                   value={f.dependent_systems}
767:                   placeholder={tx("orders.dep_systems_placeholder")}
768:                   onChange={(e) => set("dependent_systems", e.target.value)}
769:                 />
770:               </div>
771:             </Card>
772: 
773:             <Card title={tx("orders.bolim3_nomi")}>
774:               <div className="field">
775:                 <label htmlFor={`${fid}-add-mat`}>
776:                   {tx("orders.qoshimcha_materiallar")}
777:                 </label>
778:                 <textarea
779:                   id={`${fid}-add-mat`}
780:                   rows={2}
781:                   value={f.additional_materials}
782:                   placeholder={tx("orders.additional_materials_placeholder")}
783:                   onChange={(e) => set("additional_materials", e.target.value)}
784:                 />
785:               </div>
786: 
787:               <div className="field" style={{ marginTop: 16 }}>
788:                 <label htmlFor={`${fid}-files`} style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
789:                   <span>{tx("orders.biriktirilgan_fayllar_label")}</span>
790:                   <span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>{tx("orders.koplab_fayl_yuklash")}</span>
791:                 </label>
792:                 <div
793:                   style={{
794:                     border: "2px dashed var(--border-color, #cbd5e1)",
795:                     borderRadius: 8,
796:                     padding: "16px 20px",
797:                     textAlign: "center",
798:                     background: "var(--surface-2, #f8fafc)",
799:                     cursor: "pointer",
800: """
cleaned = []
for line in text_lines.splitlines():
    match = re.match(r'^\d+:\s(.*)$', line)
    if match:
        cleaned.append(match.group(1))
    else:
        match_empty = re.match(r'^\d+:$', line)
        if match_empty:
            cleaned.append('')
        else:
            cleaned.append(line)

part1 = '\n'.join(cleaned) + '\n'

with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'r', encoding='utf-8') as f:
    orig = f.read()

part2_start = orig.find('onClick={() => document.getElementById(`${fid}-files`)?.click()}')
part2 = orig[part2_start:]

full = part1 + '                  ' + part2

with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'w', encoding='utf-8') as f:
    f.write(full)
